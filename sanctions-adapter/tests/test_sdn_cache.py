from pathlib import Path

import httpx

from app.sdn_cache import SdnCache
from app.sdn_parser import CandidateName

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_sdn.xml"


class _FakeResponse:
    def __init__(self, content: bytes, status_code: int = 200):
        self.content = content
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=None)


class _FakeAsyncClient:
    def __init__(self, response: _FakeResponse | None = None, error: Exception | None = None):
        self._response = response
        self._error = error

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url):
        if self._error is not None:
            raise self._error
        return self._response


async def test_refresh_populates_candidates_from_downloaded_xml(monkeypatch):
    fixture_bytes = FIXTURE_PATH.read_bytes()
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient(response=_FakeResponse(fixture_bytes)))

    cache = SdnCache()
    await cache.refresh()

    names = {c.name for c in cache.get_candidates()}
    assert "John SMITHEXAMPLE" in names


async def test_refresh_safely_keeps_previous_cache_on_network_failure(monkeypatch):
    cache = SdnCache()
    cache._candidates = [CandidateName(name="OLD ENTRY", sdn_type="Individual", programs=[])]

    monkeypatch.setattr(
        httpx, "AsyncClient", _FakeAsyncClient(error=httpx.ConnectError("boom"))
    )

    await cache.refresh_safely()

    assert cache.get_candidates() == [CandidateName(name="OLD ENTRY", sdn_type="Individual", programs=[])]


async def test_get_candidates_returns_empty_list_before_first_refresh():
    cache = SdnCache()
    assert cache.get_candidates() == []
