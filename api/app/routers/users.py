import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.db import get_db
from app.models.enums import UserRole, UserStatus
from app.models.user import User
from app.schemas.user import InviteUserRequest, UserOut

router = APIRouter(prefix="/users", tags=["users"])

ADMIN_ROLES = (UserRole.EXPORTER_ADMIN.value, UserRole.BANK_REVIEWER.value, UserRole.BUYER.value)


@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[UserOut]:
    result = await db.execute(select(User).where(User.org_id == current_user.org_id))
    return list(result.scalars().all())


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def invite_user(
    payload: InviteUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
) -> UserOut:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    new_user = User(
        org_id=current_user.org_id,
        name=payload.name,
        email=payload.email,
        password_hash="",  # no invite-acceptance/password-set flow in Phase 1 scope
        role=payload.role.value,
        status=UserStatus.INVITED.value,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user
