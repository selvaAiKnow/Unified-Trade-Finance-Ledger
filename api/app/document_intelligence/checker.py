from typing import Protocol

from pydantic import BaseModel


class DocumentCheckResult(BaseModel):
    compliant: bool
    discrepancies: list[str]
    summary: str


class DocumentChecker(Protocol):
    async def check(self, content: bytes, trade_terms: dict[str, str]) -> DocumentCheckResult: ...
