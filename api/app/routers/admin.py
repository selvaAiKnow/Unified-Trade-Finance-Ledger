from datetime import datetime, timezone

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_role
from app.auth.security import hash_password
from app.config import settings
from app.db import get_db
from app.models.enums import KybCheckType, UserRole, UserStatus
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.trade import Trade
from app.models.user import User
from app.schemas.admin import (
    AdminBootstrapRequest,
    AdminKybCheckDecision,
    AdminKybStatusUpdate,
    AdminUserCreate,
    AdminUserStatusUpdate,
    AdminUserUpdate,
)
from app.schemas.kyb_check import KybCheckAdminOut
from app.schemas.organization import OrganizationOut
from app.schemas.trade import TradeOut
from app.storage import get_bytes
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

# Mirrors the INVITABLE_ROLES rule in app/routers/users.py: PLATFORM_ADMIN is a
# platform-wide role that must only ever be created through the secret-gated
# POST /admin/bootstrap, so admin-driven user create/edit can never grant or
# retarget it.
ADMIN_ASSIGNABLE_ROLES = {r.value for r in UserRole} - {UserRole.PLATFORM_ADMIN.value}


@router.get("/organizations", response_model=list[OrganizationOut], dependencies=[Depends(require_admin)])
async def list_all_organizations(db: AsyncSession = Depends(get_db)) -> list[Organization]:
    result = await db.execute(select(Organization).order_by(Organization.name))
    return list(result.scalars().all())


@router.get("/organizations/{org_id}", response_model=OrganizationOut, dependencies=[Depends(require_admin)])
async def get_organization(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


@router.get(
    "/organizations/{org_id}/kyb-checks",
    response_model=list[KybCheckAdminOut],
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


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_user(payload: AdminUserCreate, db: AsyncSession = Depends(get_db)) -> User:
    if payload.role.value not in ADMIN_ASSIGNABLE_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot assign the platform admin role here")

    org = await db.get(Organization, payload.org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    new_user = User(
        org_id=payload.org_id,
        name=payload.name,
        email=payload.email,
        password_hash="",  # invite-style, matching POST /users: no invite-acceptance/password-set flow yet
        role=payload.role.value,
        status=UserStatus.INVITED.value,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.get("/users/{user_id}", response_model=UserOut, dependencies=[Depends(require_admin)])
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserOut, dependencies=[Depends(require_admin)])
async def update_user(user_id: uuid.UUID, payload: AdminUserUpdate, db: AsyncSession = Depends(get_db)) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role == UserRole.PLATFORM_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot edit a platform admin through this endpoint")
    if payload.role.value not in ADMIN_ASSIGNABLE_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot assign the platform admin role here")

    org = await db.get(Organization, payload.org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    user.name = payload.name
    user.org_id = payload.org_id
    user.role = payload.role.value
    user.status = payload.status.value
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}/status", response_model=UserOut, dependencies=[Depends(require_admin)])
async def update_user_status(user_id: uuid.UUID, payload: AdminUserStatusUpdate, db: AsyncSession = Depends(get_db)) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role == UserRole.PLATFORM_ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change a platform admin's status through this endpoint"
        )
    user.status = payload.status.value
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/trades", response_model=list[TradeOut], dependencies=[Depends(require_admin)])
async def list_all_trades(db: AsyncSession = Depends(get_db)) -> list[Trade]:
    result = await db.execute(select(Trade).order_by(Trade.created_at.desc()))
    return list(result.scalars().all())


@router.get("/trades/{trade_id}", response_model=TradeOut, dependencies=[Depends(require_admin)])
async def get_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Trade:
    trade = await db.get(Trade, trade_id)
    if trade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade


@router.get(
    "/kyb-checks/business-registration",
    response_model=list[KybCheckAdminOut],
    dependencies=[Depends(require_admin)],
)
async def list_business_registration_checks(db: AsyncSession = Depends(get_db)) -> list[KybCheck]:
    result = await db.execute(
        select(KybCheck)
        .where(KybCheck.check_type == KybCheckType.BUSINESS_REGISTRATION.value)
        .order_by(KybCheck.checked_at.desc())
    )
    return list(result.scalars().all())


@router.patch(
    "/kyb-checks/{check_id}/decision",
    response_model=KybCheckAdminOut,
    dependencies=[Depends(require_admin)],
)
async def decide_kyb_check(
    check_id: uuid.UUID, payload: AdminKybCheckDecision, db: AsyncSession = Depends(get_db)
) -> KybCheck:
    check = await db.get(KybCheck, check_id)
    if check is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYB check not found")
    if check.check_type != KybCheckType.BUSINESS_REGISTRATION.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only business registration checks can be manually decided",
        )
    check.status = payload.status
    check.checked_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(check)
    return check


@router.get("/kyb-checks/{check_id}/document", dependencies=[Depends(require_admin)])
async def get_kyb_check_document(check_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    check = await db.get(KybCheck, check_id)
    if check is None or check.detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    content = get_bytes(check.detail)
    return Response(content=content, media_type=check.document_content_type or "application/octet-stream")
