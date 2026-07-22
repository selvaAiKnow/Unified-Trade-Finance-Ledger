import uuid

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import OrgType
from app.schemas.organization import OrganizationOut


class SignupOrganization(BaseModel):
    name: str
    org_type: OrgType
    country: str
    industry: str
    tax_id: str


class SignupAdminUser(BaseModel):
    name: str
    email: EmailStr
    password: str


class SignupRequest(BaseModel):
    organization: SignupOrganization
    admin_user: SignupAdminUser


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    email: str
    role: str
    status: str


class SignupResponse(BaseModel):
    organization: OrganizationOut
    user: UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
