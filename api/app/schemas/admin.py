from pydantic import BaseModel, EmailStr


class AdminBootstrapRequest(BaseModel):
    secret: str
    name: str
    email: EmailStr
    password: str
