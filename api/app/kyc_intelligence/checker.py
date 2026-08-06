from typing import Protocol

from pydantic import BaseModel


class KybDocumentCheckResult(BaseModel):
    verified: bool
    summary: str


class KybDocumentChecker(Protocol):
    async def check(self, content: bytes, org_name: str, media_type: str) -> KybDocumentCheckResult | None: ...
