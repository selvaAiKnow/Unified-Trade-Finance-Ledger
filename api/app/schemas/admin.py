import uuid

from pydantic import BaseModel, EmailStr

from app.models.enums import KybStatus, UserRole, UserStatus


class AdminBootstrapRequest(BaseModel):
    secret: str
    name: str
    email: EmailStr
    password: str


class AdminKybStatusUpdate(BaseModel):
    kyb_status: KybStatus


class AdminUserCreate(BaseModel):
    name: str
    email: EmailStr
    org_id: uuid.UUID
    role: UserRole


class AdminUserUpdate(BaseModel):
    name: str
    org_id: uuid.UUID
    role: UserRole
    status: UserStatus


class AdminUserStatusUpdate(BaseModel):
    status: UserStatus
