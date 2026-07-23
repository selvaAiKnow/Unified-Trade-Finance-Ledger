import httpx
import pytest

from app.sanctions.http_client import HttpSanctionsClient


async def test_http_sanctions_client_returns_parsed_result():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/screen"
        body = request.read()
        assert b"Jane Doe" in body
        return httpx.Response(200, json={"status": "CLEAR", "matches": [], "raw": {"query": "test"}})

    transport = httpx.MockTransport(handler)
    client = HttpSanctionsClient(base_url="http://sanctions-adapter.test", transport=transport)

    result = await client.screen(name="Jane Doe", country="US")

    assert result["status"] == "CLEAR"
    assert result["matches"] == []
    assert result["raw"] == {"query": "test"}


async def test_http_sanctions_client_raises_on_error_response():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    transport = httpx.MockTransport(handler)
    client = HttpSanctionsClient(base_url="http://sanctions-adapter.test", transport=transport)

    with pytest.raises(httpx.HTTPStatusError):
        await client.screen(name="Jane Doe", country="US")
