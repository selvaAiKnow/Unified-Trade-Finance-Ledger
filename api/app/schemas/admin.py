from pydantic import BaseModel, EmailStr

from app.models.enums import KybStatus


class AdminBootstrapRequest(BaseModel):
    secret: str
    name: str
    email: EmailStr
    password: str


class AdminKybStatusUpdate(BaseModel):
    kyb_status: KybStatus
