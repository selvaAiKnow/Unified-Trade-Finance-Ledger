import httpx

from app.sanctions.client import SanctionsResult


class HttpSanctionsClient:
    def __init__(self, base_url: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._base_url = base_url
        self._transport = transport

    async def screen(self, name: str, country: str) -> SanctionsResult:
        async with httpx.AsyncClient(base_url=self._base_url, transport=self._transport, timeout=10.0) as client:
            response = await client.post("/screen", json={"name": name, "country": country})
            response.raise_for_status()
            data = response.json()
        return {"status": data["status"], "matches": data["matches"], "raw": data["raw"]}
