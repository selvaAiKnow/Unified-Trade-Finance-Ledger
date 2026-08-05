import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import user_can_access_org
from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.enums import KybCheckStatus, KybCheckType
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User
from app.schemas.kyb_check import KybCheckOut
from app.schemas.organization import OrganizationOut
from app.storage import upload_bytes

router = APIRouter(prefix="/organizations", tags=["organizations"])

MAX_BUSINESS_REGISTRATION_DOCUMENT_SIZE = 10 * 1024 * 1024


def _is_allowed_document_content_type(content_type: str | None) -> bool:
    if content_type is None:
        return False
    return content_type == "application/pdf" or content_type.startswith("image/")


@router.get("", response_model=list[OrganizationOut])
async def list_organizations(
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[Organization]:
    query = select(Organization).order_by(Organization.name)
    if search:
        query = query.where(Organization.name.ilike(f"%{search}%"))
    result = await db.execute(query.limit(20))
    return list(result.scalars().all())


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


@router.post("/{org_id}/kyb-checks/business-registration-document", response_model=KybCheckOut)
async def upload_business_registration_document(
    org_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KybCheckOut:
    if current_user.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    result = await db.execute(
        select(KybCheck).where(
            KybCheck.org_id == org_id,
            KybCheck.check_type == KybCheckType.BUSINESS_REGISTRATION.value,
        )
    )
    check = result.scalar_one_or_none()
    if check is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    if check.status == KybCheckStatus.PASSED.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Business registration is already verified")

    content = await file.read()
    if len(content) > MAX_BUSINESS_REGISTRATION_DOCUMENT_SIZE:
        raise HTTPException(status_code=422, detail="Business registration document exceeds the 10 MB size limit")
    if not _is_allowed_document_content_type(file.content_type):
        raise HTTPException(status_code=422, detail="Business registration document must be a PDF or an image")

    safe_document_name = Path(file.filename or "").name or "document"
    object_key = f"org/{org_id}/{uuid.uuid4()}-{safe_document_name}"
    upload_bytes(object_key, content, file.content_type or "application/octet-stream")

    check.status = KybCheckStatus.PASSED.value
    check.detail = object_key
    await db.commit()
    await db.refresh(check)
    return check
