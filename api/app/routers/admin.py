from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_password
from app.config import settings
from app.db import get_db
from app.models.enums import UserRole, UserStatus
from app.models.user import User
from app.schemas.admin import AdminBootstrapRequest
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
