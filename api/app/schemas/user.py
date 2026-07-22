import uuid

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import UserRole, UserStatus


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    email: str
    role: UserRole
    status: UserStatus


class InviteUserRequest(BaseModel):
    name: str
    email: EmailStr
    role: UserRole
