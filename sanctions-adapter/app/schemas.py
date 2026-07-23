from typing import Any

from pydantic import BaseModel


class ScreenRequest(BaseModel):
    name: str
    country: str


class MatchDetail(BaseModel):
    name: str
    sdn_type: str
    program: str
    match_kind: str


class ScreenResponse(BaseModel):
    status: str
    matches: list[MatchDetail]
    raw: dict[str, Any]
