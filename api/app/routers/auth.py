from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.security import create_access_token, hash_password, verify_password
from app.db import get_db
from app.models.enums import KybCheckStatus, KybCheckType, UserRole, UserStatus
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User
from app.sanctions.client import SanctionsClient
from app.sanctions.dependency import get_sanctions_client
from app.schemas.auth import LoginRequest, LoginResponse, SignupRequest, SignupResponse, UserOut

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


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return current_user
