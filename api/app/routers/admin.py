import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_role
from app.auth.security import hash_password
from app.config import settings
from app.db import get_db
from app.models.enums import UserRole, UserStatus
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.trade import Trade
from app.models.user import User
from app.schemas.admin import AdminBootstrapRequest, AdminKybStatusUpdate
from app.schemas.kyb_check import KybCheckOut
from app.schemas.organization import OrganizationOut
from app.schemas.trade import TradeOut
from app.schemas.user import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/bootstrap", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def bootstrap_admin(
    payload: AdminBootstrapRequest,
    db: AsyncSession = Depends(get_db),
) -> User:
    if not settings.admin_bootstrap_secret or payload.secret != settings.admin_bootstrap_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bootstrap secret")

    existing_admin = await db.execute(select(User).where(User.role == UserRole.PLATFORM_ADMIN.value))
    if existing_admin.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A platform admin already exists")

    existing_email = await db.execute(select(User).where(User.email == payload.email))
    if existing_email.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    admin_user = User(
        org_id=None,
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=UserRole.PLATFORM_ADMIN.value,
        status=UserStatus.ACTIVE.value,
    )
    db.add(admin_user)
    try:
        await db.commit()
    except IntegrityError:
        # Catch race condition where another request committed a PLATFORM_ADMIN
        # between our pre-check and our insert. The partial unique index on
        # users.role ensures exactly one PLATFORM_ADMIN can exist.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A platform admin already exists")
    await db.refresh(admin_user)
    return admin_user


require_admin = require_role(UserRole.PLATFORM_ADMIN.value)


@router.get("/organizations", response_model=list[OrganizationOut], dependencies=[Depends(require_admin)])
async def list_all_organizations(db: AsyncSession = Depends(get_db)) -> list[Organization]:
    result = await db.execute(select(Organization).order_by(Organization.name))
    return list(result.scalars().all())


@router.get(
    "/organizations/{org_id}/kyb-checks",
    response_model=list[KybCheckOut],
    dependencies=[Depends(require_admin)],
)
async def list_all_organization_kyb_checks(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> list[KybCheck]:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    result = await db.execute(select(KybCheck).where(KybCheck.org_id == org_id))
    return list(result.scalars().all())


@router.patch(
    "/organizations/{org_id}/kyb-status",
    response_model=OrganizationOut,
    dependencies=[Depends(require_admin)],
)
async def update_organization_kyb_status(
    org_id: uuid.UUID,
    payload: AdminKybStatusUpdate,
    db: AsyncSession = Depends(get_db),
) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    org.kyb_status = payload.kyb_status.value
    await db.commit()
    await db.refresh(org)
    return org


@router.get("/users", response_model=list[UserOut], dependencies=[Depends(require_admin)])
async def list_all_users(db: AsyncSession = Depends(get_db)) -> list[User]:
    result = await db.execute(select(User).order_by(User.name))
    return list(result.scalars().all())


@router.get("/trades", response_model=list[TradeOut], dependencies=[Depends(require_admin)])
async def list_all_trades(db: AsyncSession = Depends(get_db)) -> list[Trade]:
    result = await db.execute(select(Trade).order_by(Trade.created_at.desc()))
    return list(result.scalars().all())
