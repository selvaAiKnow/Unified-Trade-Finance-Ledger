from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_password
from app.db import get_db
from app.models.enums import KybCheckStatus, KybCheckType, UserRole, UserStatus
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User
from app.sanctions.client import SanctionsClient
from app.sanctions.dependency import get_sanctions_client
from app.schemas.auth import SignupRequest, SignupResponse

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
