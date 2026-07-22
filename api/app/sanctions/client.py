from typing import Any, Protocol, TypedDict


class SanctionsResult(TypedDict):
    status: str  # CLEAR | REVIEW | BLOCK
    matches: list[dict[str, Any]]
    raw: dict[str, Any]


class SanctionsClient(Protocol):
    async def screen(self, name: str, country: str) -> SanctionsResult: ...
