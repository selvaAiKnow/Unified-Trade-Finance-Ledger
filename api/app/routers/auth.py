import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from app.config import settings
from app.db import get_db
from app.models.enums import KybCheckStatus, KybCheckType, UserRole, UserStatus
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.password_reset_otp import PasswordResetOtp
from app.models.user import User
from app.sanctions.client import SanctionsClient
from app.sanctions.dependency import get_sanctions_client
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SignupRequest,
    SignupResponse,
    UserOut,
    VerifyOtpRequest,
    VerifyOtpResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

ORG_TYPE_TO_ADMIN_ROLE = {
    "EXPORTER": UserRole.EXPORTER_ADMIN.value,
    "BUYER": UserRole.BUYER.value,
    "BANK": UserRole.BANK_REVIEWER.value,
}


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    db: AsyncSession = Depends(get_db),
    sanctions_client: SanctionsClient = Depends(get_sanctions_client),
) -> SignupResponse:
    existing = await db.execute(select(User).where(User.email == payload.admin_user.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    org = Organization(
        name=payload.organization.name,
        org_type=payload.organization.org_type.value,
        country=payload.organization.country,
        industry=payload.organization.industry,
        tax_id=payload.organization.tax_id,
    )
    db.add(org)
    await db.flush()

    admin_role = ORG_TYPE_TO_ADMIN_ROLE[payload.organization.org_type.value]
    user = User(
        org_id=org.id,
        name=payload.admin_user.name,
        email=payload.admin_user.email,
        password_hash=hash_password(payload.admin_user.password),
        role=admin_role,
        status=UserStatus.ACTIVE.value,
    )
    db.add(user)

    sanctions_result = await sanctions_client.screen(name=org.name, country=org.country)
    org.kyb_status = sanctions_result["status"]
    db.add_all(
        [
            KybCheck(org_id=org.id, check_type=KybCheckType.BUSINESS_REGISTRATION.value, status=KybCheckStatus.PASSED.value),
            KybCheck(
                org_id=org.id,
                check_type=KybCheckType.SANCTIONS_SCREENING.value,
                status=KybCheckStatus.PASSED.value if sanctions_result["status"] == "CLEAR" else KybCheckStatus.FAILED.value,
                detail=f"fake:{sanctions_result['status']}",
            ),
            KybCheck(org_id=org.id, check_type=KybCheckType.BANK_ACCOUNT.value, status=KybCheckStatus.PASSED.value),
        ]
    )

    await db.commit()
    await db.refresh(org)
    await db.refresh(user)

    return SignupResponse(organization=org, user=user)


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(user_id=str(user.id), org_id=str(user.org_id), role=user.role)
    return LoginResponse(access_token=token)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)) -> ForgotPasswordResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found with that email")

    now = datetime.now(timezone.utc)
    existing = await db.execute(
        select(PasswordResetOtp).where(PasswordResetOtp.user_id == user.id, PasswordResetOtp.consumed_at.is_(None))
    )
    for stale_otp in existing.scalars().all():
        stale_otp.consumed_at = now

    code = f"{secrets.randbelow(1_000_000):06d}"
    otp = PasswordResetOtp(
        user_id=user.id,
        code_hash=hash_password(code),
        expires_at=now + timedelta(minutes=settings.otp_expiry_minutes),
    )
    db.add(otp)
    await db.commit()

    return ForgotPasswordResponse(message="A verification code has been generated.", otp_code=code)


@router.post("/verify-otp", response_model=VerifyOtpResponse)
async def verify_otp(payload: VerifyOtpRequest, db: AsyncSession = Depends(get_db)) -> VerifyOtpResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    otp_result = await db.execute(
        select(PasswordResetOtp)
        .where(PasswordResetOtp.user_id == user.id, PasswordResetOtp.consumed_at.is_(None))
        .order_by(PasswordResetOtp.created_at.desc())
    )
    otp = otp_result.scalars().first()
    if otp is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    if otp.attempt_count >= settings.otp_max_attempts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many attempts. Request a new code.")

    now = datetime.now(timezone.utc)
    if otp.expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    if not verify_password(payload.code, otp.code_hash):
        otp.attempt_count += 1
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    otp.consumed_at = now
    await db.commit()

    reset_token = create_password_reset_token(user_id=str(user.id))
    return VerifyOtpResponse(reset_token=reset_token)


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> ResetPasswordResponse:
    user_id = decode_password_reset_token(payload.reset_token)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")

    user = await db.get(User, uuid.UUID(user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")

    user.password_hash = hash_password(payload.new_password)
    await db.commit()

    return ResetPasswordResponse(message="Password reset successful. Please sign in with your new password.")


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return current_user
