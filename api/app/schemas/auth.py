from pydantic import BaseModel, EmailStr, Field

from app.models.enums import OrgType
from app.schemas.kyb_check import KybCheckOut
from app.schemas.organization import OrganizationOut
from app.schemas.user import UserOut


class SignupRequest(BaseModel):
    org_name: str
    org_type: OrgType
    country: str
    industry: str
    tax_id: str
    admin_name: str
    admin_email: EmailStr
    password: str


class SignupResponse(BaseModel):
    organization: OrganizationOut
    user: UserOut
    kyb_checks: list[KybCheckOut]
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    otp_code: str


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str


class VerifyOtpResponse(BaseModel):
    reset_token: str


class ResetPasswordRequest(BaseModel):
    reset_token: str
    # bcrypt.hashpw raises on inputs longer than 72 bytes, so cap it here and 422
    # rather than 500 on an over-long password.
    new_password: str = Field(min_length=8, max_length=72)


class ResetPasswordResponse(BaseModel):
    message: str
