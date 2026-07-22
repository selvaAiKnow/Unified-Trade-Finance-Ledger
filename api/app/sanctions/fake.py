from app.sanctions.client import SanctionsResult


class FakeSanctionsClient:
    async def screen(self, name: str, country: str) -> SanctionsResult:
        return {"status": "CLEAR", "matches": [], "raw": {"provider": "fake", "name": name, "country": country}}
