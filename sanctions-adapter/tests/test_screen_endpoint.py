from httpx import ASGITransport, AsyncClient

from app.main import app
from app.sdn_cache import sdn_cache
from app.sdn_parser import CandidateName


async def _post_screen(name: str, country: str = "US"):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/screen", json={"name": name, "country": country})


async def test_screen_returns_block_on_exact_match():
    sdn_cache._candidates = [
        CandidateName(name="John SMITHEXAMPLE", sdn_type="Individual", programs=["SDGT"])
    ]

    response = await _post_screen("John Smithexample")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "BLOCK"
    assert len(body["matches"]) == 1
    assert body["matches"][0]["program"] == "SDGT"


async def test_screen_returns_review_on_fuzzy_match():
    sdn_cache._candidates = [
        CandidateName(name="John SMITHEXAMPLE", sdn_type="Individual", programs=["SDGT"])
    ]

    response = await _post_screen("John Smithexample Junior")

    assert response.status_code == 200
    assert response.json()["status"] == "REVIEW"


async def test_screen_returns_clear_when_no_match():
    sdn_cache._candidates = [
        CandidateName(name="John SMITHEXAMPLE", sdn_type="Individual", programs=["SDGT"])
    ]

    response = await _post_screen("A Completely Unrelated Name")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "CLEAR"
    assert body["matches"] == []


async def test_health_still_works():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
