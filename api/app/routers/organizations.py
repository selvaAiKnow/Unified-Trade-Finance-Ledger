import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import user_can_access_org
from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User
from app.schemas.kyb_check import KybCheckOut
from app.schemas.organization import OrganizationOut

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/{org_id}", response_model=OrganizationOut)
async def get_organization(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationOut:
    org = await db.get(Organization, org_id)
    if org is None or not await user_can_access_org(current_user, org_id, db):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


@router.get("/{org_id}/kyb-checks", response_model=list[KybCheckOut])
async def get_organization_kyb_checks(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[KybCheckOut]:
    org = await db.get(Organization, org_id)
    if org is None or not await user_can_access_org(current_user, org_id, db):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    result = await db.execute(select(KybCheck).where(KybCheck.org_id == org_id))
    return list(result.scalars().all())
