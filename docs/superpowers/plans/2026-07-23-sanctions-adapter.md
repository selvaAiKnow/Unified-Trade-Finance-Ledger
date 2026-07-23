# Sanctions Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `sanctions-adapter/` FastAPI service that screens names against OFAC's SDN list (downloaded directly from Treasury, matched locally — no third-party OFAC API product), and wire a real HTTP-calling `SanctionsClient` implementation into the already-merged `api` service to replace `FakeSanctionsClient` for real usage, as specified in `docs/superpowers/specs/2026-07-23-sanctions-adapter-design.md`.

**Architecture:** A standalone, stateless FastAPI service with an in-memory SDN candidate-name cache (refreshed periodically from Treasury's SDN.XML export), pure normalization/grading logic, and one `POST /screen` endpoint whose response shape matches `api`'s already-fixed `SanctionsResult` TypedDict exactly. `api` gets a new `HttpSanctionsClient` that calls this service over HTTP, selected via a config flag so all of `api`'s existing tests (which rely on `FakeSanctionsClient`) keep passing unchanged.

**Tech Stack:** Python 3.11+, FastAPI, httpx (both as the adapter's own SDN-download client and as `api`'s new HTTP client to the adapter), Pydantic v2, pytest + pytest-asyncio, stdlib `xml.etree.ElementTree` and `difflib`.

## Global Constraints

- Every file lives under `sanctions-adapter/app/`; every test under `sanctions-adapter/tests/`; run via `pytest` from the `sanctions-adapter/` directory.
- No Postgres/MinIO/Docker Compose dependency for this service — it is stateless, in-memory only. No `infra/docker-compose.yml` changes in this plan.
- Name normalization: uppercase, strip all characters except `A-Z`, `0-9`, and whitespace, collapse whitespace. Exact match after normalization → `BLOCK`. `difflib.SequenceMatcher(None, a, b).ratio() >= 0.85` OR one normalized name is a substring of the other → `REVIEW`. Otherwise → `CLEAR`. These are fixed values from the spec — do not tune them without updating the spec first.
- `country` is accepted by both the adapter's `/screen` request and `api`'s `SanctionsClient.screen()` but never used to filter matches in this plan — a documented Phase 1 simplification, not a bug to fix.
- The adapter's SDN cache must keep serving its last-successful data if a refresh fails — never go empty or crash the service on a transient network failure to Treasury.
- `api`'s `get_sanctions_client()` must default to `FakeSanctionsClient` (i.e., every existing `api` test keeps passing with zero changes) and only switch to `HttpSanctionsClient` when `settings.sanctions_adapter_url` is explicitly set.
- `HttpSanctionsClient.screen()` must raise (not swallow) on a non-2xx response or network failure — a screening failure must never be silently treated as `CLEAR`.
- No authentication on the adapter's `/screen`/`/health` endpoints (internal, trusted-network call only, per the spec).
- Frequent commits: one commit per task, after its tests pass.

---

## File Structure

```
sanctions-adapter/requirements.txt
sanctions-adapter/requirements-dev.txt
sanctions-adapter/pytest.ini
sanctions-adapter/app/__init__.py
sanctions-adapter/app/main.py           # FastAPI app, lifespan startup refresh, /health, /screen
sanctions-adapter/app/config.py         # sdn_xml_url, refresh_interval_seconds
sanctions-adapter/app/matching.py       # normalize_name, grade_match (pure functions)
sanctions-adapter/app/sdn_parser.py     # CandidateName, parse_sdn_xml
sanctions-adapter/app/sdn_cache.py      # SdnCache: refresh/refresh_safely/run_periodic_refresh/get_candidates
sanctions-adapter/app/schemas.py        # ScreenRequest, MatchDetail, ScreenResponse
sanctions-adapter/tests/test_health.py
sanctions-adapter/tests/test_matching.py
sanctions-adapter/tests/fixtures/sample_sdn.xml
sanctions-adapter/tests/test_sdn_parser.py
sanctions-adapter/tests/test_sdn_cache.py
sanctions-adapter/tests/test_screen_endpoint.py

api/app/sanctions/http_client.py        # new: HttpSanctionsClient
api/app/config.py                       # modified: add sanctions_adapter_url
api/app/sanctions/dependency.py         # modified: choose fake vs http client
api/tests/test_http_sanctions_client.py # new
```

---

### Task 1: Project scaffold and health check

**Files:**
- Create: `sanctions-adapter/requirements.txt`, `sanctions-adapter/requirements-dev.txt`, `sanctions-adapter/pytest.ini`
- Create: `sanctions-adapter/app/__init__.py`, `sanctions-adapter/app/main.py`
- Test: `sanctions-adapter/tests/test_health.py`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a running FastAPI app (`app.main.app`) with `GET /health` — the foundation Tasks 2-5 build on.

- [ ] **Step 1: Write `sanctions-adapter/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
httpx==0.27.2
pydantic==2.9.2
pydantic-settings==2.5.2
```

- [ ] **Step 2: Write `sanctions-adapter/requirements-dev.txt`**

```
-r requirements.txt
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 3: Create a virtualenv and install dependencies**

```bash
cd sanctions-adapter
python -m venv .venv
. .venv/Scripts/activate   # Windows Git Bash; use `source .venv/bin/activate` on Linux/Mac
pip install -r requirements-dev.txt
```

- [ ] **Step 4: Write `sanctions-adapter/pytest.ini`**

```ini
[pytest]
pythonpath = .
asyncio_mode = auto
```

- [ ] **Step 5: Write `sanctions-adapter/app/__init__.py`** (empty file)

- [ ] **Step 6: Write `sanctions-adapter/app/main.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="UTFL Sanctions Adapter")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Write the failing test `sanctions-adapter/tests/test_health.py`**

```python
from httpx import ASGITransport, AsyncClient

from app.main import app


async def test_health_returns_ok():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 8: Run the test**

Run (from `sanctions-adapter/`): `pytest tests/test_health.py -v`
Expected: PASS (1 test)

- [ ] **Step 9: Commit**

```bash
git add requirements.txt requirements-dev.txt pytest.ini app/__init__.py app/main.py tests/test_health.py
git commit -m "Scaffold sanctions-adapter service"
```

---

### Task 2: Name normalization and match grading

**Files:**
- Create: `sanctions-adapter/app/matching.py`
- Test: `sanctions-adapter/tests/test_matching.py`

**Interfaces:**
- Consumes: nothing new
- Produces: `normalize_name(name: str) -> str`, `grade_match(query: str, candidate: str) -> str` (returns `"EXACT"`, `"FUZZY"`, or `"NONE"`) — consumed by the `/screen` endpoint in Task 5.

- [ ] **Step 1: Write the failing test `sanctions-adapter/tests/test_matching.py`**

```python
from app.matching import grade_match, normalize_name


def test_normalize_name_uppercases_strips_punctuation_and_collapses_whitespace():
    assert normalize_name("  John   O'Smith-Jones Jr.  ") == "JOHN OSMITHJONES JR"


def test_grade_match_exact_after_normalization():
    assert grade_match("john smith", "JOHN   SMITH") == "EXACT"


def test_grade_match_fuzzy_substring():
    assert grade_match("John Smith", "John Smith Jr") == "FUZZY"


def test_grade_match_fuzzy_similar_spelling():
    assert grade_match("Jon Smyth", "John Smith") == "FUZZY"


def test_grade_match_none_for_unrelated_names():
    assert grade_match("Alice Johnson", "Robert Chen") == "NONE"


def test_grade_match_none_for_empty_input():
    assert grade_match("", "John Smith") == "NONE"
    assert grade_match("John Smith", "") == "NONE"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_matching.py -v`
Expected: FAIL — `app.matching` doesn't exist yet.

- [ ] **Step 3: Write `sanctions-adapter/app/matching.py`**

```python
import re
from difflib import SequenceMatcher

FUZZY_THRESHOLD = 0.85


def normalize_name(name: str) -> str:
    upper = name.upper()
    stripped = re.sub(r"[^A-Z0-9\s]", "", upper)
    return re.sub(r"\s+", " ", stripped).strip()


def grade_match(query: str, candidate: str) -> str:
    normalized_query = normalize_name(query)
    normalized_candidate = normalize_name(candidate)

    if not normalized_query or not normalized_candidate:
        return "NONE"

    if normalized_query == normalized_candidate:
        return "EXACT"

    if normalized_query in normalized_candidate or normalized_candidate in normalized_query:
        return "FUZZY"

    ratio = SequenceMatcher(None, normalized_query, normalized_candidate).ratio()
    if ratio >= FUZZY_THRESHOLD:
        return "FUZZY"

    return "NONE"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_matching.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add app/matching.py tests/test_matching.py
git commit -m "Add name normalization and match grading"
```

---

### Task 3: SDN.XML parsing

**Files:**
- Create: `sanctions-adapter/app/sdn_parser.py`, `sanctions-adapter/tests/fixtures/sample_sdn.xml`
- Test: `sanctions-adapter/tests/test_sdn_parser.py`

**Interfaces:**
- Consumes: nothing new
- Produces: `CandidateName` (dataclass: `name: str`, `sdn_type: str`, `programs: list[str]`), `parse_sdn_xml(xml_bytes: bytes) -> list[CandidateName]` — consumed by `SdnCache` in Task 4.

- [ ] **Step 1: Write the fixture `sanctions-adapter/tests/fixtures/sample_sdn.xml`**

Uses clearly fictional example names (not real sanctioned parties) and includes an XML namespace, since OFAC's real export is namespaced and the parser must handle that:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sdnList xmlns="http://tempuri.org/sdnList.xsd">
  <sdnEntry>
    <uid>1001</uid>
    <firstName>John</firstName>
    <lastName>SMITHEXAMPLE</lastName>
    <sdnType>Individual</sdnType>
    <programList>
      <program>SDGT</program>
    </programList>
    <akaList>
      <aka>
        <uid>2001</uid>
        <type>a.k.a.</type>
        <category>strong</category>
        <firstName>Johnny</firstName>
        <lastName>SMITHALIAS</lastName>
      </aka>
    </akaList>
  </sdnEntry>
  <sdnEntry>
    <uid>1002</uid>
    <firstName></firstName>
    <lastName>ACME EXPORTS EXAMPLE LTD</lastName>
    <sdnType>Entity</sdnType>
    <programList>
      <program>CUBA</program>
      <program>IRAN</program>
    </programList>
  </sdnEntry>
</sdnList>
```

- [ ] **Step 2: Write the failing test `sanctions-adapter/tests/test_sdn_parser.py`**

```python
from pathlib import Path

from app.sdn_parser import parse_sdn_xml

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_sdn.xml"


def test_parse_sdn_xml_extracts_primary_names_and_aliases():
    xml_bytes = FIXTURE_PATH.read_bytes()

    candidates = parse_sdn_xml(xml_bytes)
    names = {c.name for c in candidates}

    assert "John SMITHEXAMPLE" in names
    assert "Johnny SMITHALIAS" in names
    assert "ACME EXPORTS EXAMPLE LTD" in names
    assert len(candidates) == 3


def test_parse_sdn_xml_carries_sdn_type_and_programs():
    xml_bytes = FIXTURE_PATH.read_bytes()

    candidates = parse_sdn_xml(xml_bytes)
    by_name = {c.name: c for c in candidates}

    assert by_name["John SMITHEXAMPLE"].sdn_type == "Individual"
    assert by_name["John SMITHEXAMPLE"].programs == ["SDGT"]
    assert by_name["Johnny SMITHALIAS"].sdn_type == "Individual"
    assert by_name["Johnny SMITHALIAS"].programs == ["SDGT"]
    assert by_name["ACME EXPORTS EXAMPLE LTD"].sdn_type == "Entity"
    assert by_name["ACME EXPORTS EXAMPLE LTD"].programs == ["CUBA", "IRAN"]
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_sdn_parser.py -v`
Expected: FAIL — `app.sdn_parser` doesn't exist yet.

- [ ] **Step 4: Write `sanctions-adapter/app/sdn_parser.py`**

```python
import xml.etree.ElementTree as ET
from dataclasses import dataclass


@dataclass
class CandidateName:
    name: str
    sdn_type: str
    programs: list[str]


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _local_findall(element: ET.Element, tag: str) -> list[ET.Element]:
    return [child for child in element if _strip_ns(child.tag) == tag]


def _local_find(element: ET.Element, tag: str) -> ET.Element | None:
    for child in element:
        if _strip_ns(child.tag) == tag:
            return child
    return None


def _text(element: ET.Element | None) -> str:
    return element.text.strip() if element is not None and element.text else ""


def parse_sdn_xml(xml_bytes: bytes) -> list[CandidateName]:
    root = ET.fromstring(xml_bytes)
    candidates: list[CandidateName] = []

    for entry in _local_findall(root, "sdnEntry"):
        sdn_type = _text(_local_find(entry, "sdnType")) or "Unknown"
        program_list = _local_find(entry, "programList")
        programs = (
            [_text(p) for p in _local_findall(program_list, "program")]
            if program_list is not None
            else []
        )

        first_name = _text(_local_find(entry, "firstName"))
        last_name = _text(_local_find(entry, "lastName"))
        primary_name = f"{first_name} {last_name}".strip()
        if primary_name:
            candidates.append(CandidateName(name=primary_name, sdn_type=sdn_type, programs=programs))

        aka_list = _local_find(entry, "akaList")
        if aka_list is not None:
            for aka in _local_findall(aka_list, "aka"):
                aka_first = _text(_local_find(aka, "firstName"))
                aka_last = _text(_local_find(aka, "lastName"))
                aka_name = f"{aka_first} {aka_last}".strip()
                if aka_name:
                    candidates.append(CandidateName(name=aka_name, sdn_type=sdn_type, programs=programs))

    return candidates
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_sdn_parser.py -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add app/sdn_parser.py tests/fixtures/sample_sdn.xml tests/test_sdn_parser.py
git commit -m "Add SDN.XML parsing"
```

---

### Task 4: SDN cache with download and periodic refresh

**Files:**
- Create: `sanctions-adapter/app/config.py`, `sanctions-adapter/app/sdn_cache.py`
- Test: `sanctions-adapter/tests/test_sdn_cache.py`

**Interfaces:**
- Consumes: `CandidateName`, `parse_sdn_xml` (Task 3)
- Produces: `settings` (`app/config.py`, exposes `sdn_xml_url`, `refresh_interval_seconds`), `SdnCache` class with `get_candidates() -> list[CandidateName]`, `async def refresh() -> None`, `async def refresh_safely() -> None`, `async def run_periodic_refresh() -> None`, and a module-level `sdn_cache = SdnCache()` instance — consumed by `main.py`'s lifespan and the `/screen` endpoint in Task 5.

- [ ] **Step 1: Write `sanctions-adapter/app/config.py`**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    sdn_xml_url: str = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML"
    refresh_interval_seconds: int = 86400

    class Config:
        env_file = ".env"


settings = Settings()
```

**Note for the implementer:** verify `sdn_xml_url`'s default against `https://ofac.treasury.gov/sanctions-list-service` at implementation time — this default is based on documented URL structure, not a freshly-confirmed live response (see the design spec's "Implementation-time verification required" note). It's overridable via the `SDN_XML_URL` environment variable regardless, so an incorrect default doesn't block anything — just update this default if you find the live URL differs.

- [ ] **Step 2: Write the failing test `sanctions-adapter/tests/test_sdn_cache.py`**

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_sdn_cache.py -v`
Expected: FAIL — `app.sdn_cache` doesn't exist yet.

- [ ] **Step 4: Write `sanctions-adapter/app/sdn_cache.py`**

```python
import asyncio
import logging

import httpx

from app.config import settings
from app.sdn_parser import CandidateName, parse_sdn_xml

logger = logging.getLogger(__name__)


class SdnCache:
    def __init__(self) -> None:
        self._candidates: list[CandidateName] = []

    def get_candidates(self) -> list[CandidateName]:
        return self._candidates

    async def refresh(self) -> None:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(settings.sdn_xml_url)
            response.raise_for_status()
            candidates = parse_sdn_xml(response.content)
        self._candidates = candidates

    async def refresh_safely(self) -> None:
        try:
            await self.refresh()
        except Exception:
            logger.exception("SDN list refresh failed; keeping previous cache")

    async def run_periodic_refresh(self) -> None:
        while True:
            await asyncio.sleep(settings.refresh_interval_seconds)
            await self.refresh_safely()


sdn_cache = SdnCache()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_sdn_cache.py -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add app/config.py app/sdn_cache.py tests/test_sdn_cache.py
git commit -m "Add SDN cache with download and periodic refresh"
```

---

### Task 5: `/screen` endpoint and lifespan wiring

**Files:**
- Create: `sanctions-adapter/app/schemas.py`
- Modify: `sanctions-adapter/app/main.py`
- Test: `sanctions-adapter/tests/test_screen_endpoint.py`

**Interfaces:**
- Consumes: `grade_match` (Task 2), `sdn_cache` (Task 4)
- Produces: `POST /screen` (request `{name, country}`, response `{status, matches, raw}` matching `api`'s `SanctionsResult` shape exactly) — this is the contract Task 6's `HttpSanctionsClient` calls.

- [ ] **Step 1: Write `sanctions-adapter/app/schemas.py`**

```python
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
```

- [ ] **Step 2: Write the failing test `sanctions-adapter/tests/test_screen_endpoint.py`**

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_screen_endpoint.py -v`
Expected: FAIL — `/screen` doesn't exist (404).

- [ ] **Step 4: Write the full `sanctions-adapter/app/main.py`**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.matching import grade_match
from app.schemas import MatchDetail, ScreenRequest, ScreenResponse
from app.sdn_cache import sdn_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    await sdn_cache.refresh_safely()
    yield


app = FastAPI(title="UTFL Sanctions Adapter", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/screen", response_model=ScreenResponse)
async def screen(payload: ScreenRequest) -> ScreenResponse:
    matches: list[MatchDetail] = []
    best_status = "CLEAR"

    for candidate in sdn_cache.get_candidates():
        kind = grade_match(payload.name, candidate.name)
        if kind == "NONE":
            continue

        for program in candidate.programs or ["UNSPECIFIED"]:
            matches.append(
                MatchDetail(name=candidate.name, sdn_type=candidate.sdn_type, program=program, match_kind=kind)
            )

        if kind == "EXACT":
            best_status = "BLOCK"
        elif kind == "FUZZY" and best_status != "BLOCK":
            best_status = "REVIEW"

    return ScreenResponse(
        status=best_status,
        matches=matches,
        raw={"query": {"name": payload.name, "country": payload.country}, "match_count": len(matches)},
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_screen_endpoint.py -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full suite**

Run: `pytest -v`
Expected: all tests from Tasks 1-5 PASS.

- [ ] **Step 7: Commit**

```bash
git add app/schemas.py app/main.py tests/test_screen_endpoint.py
git commit -m "Add /screen endpoint and lifespan wiring"
```

---

### Task 6: Wire a real HTTP-calling SanctionsClient into `api`

**Files:**
- Create: `api/app/sanctions/http_client.py`
- Modify: `api/app/config.py`, `api/app/sanctions/dependency.py`
- Test: `api/tests/test_http_sanctions_client.py`

**Interfaces:**
- Consumes: `SanctionsClient`, `SanctionsResult` (already defined in `api/app/sanctions/client.py` from the earlier `api` sub-project)
- Produces: `HttpSanctionsClient(base_url: str, transport: httpx.AsyncBaseTransport | None = None)` implementing `SanctionsClient` — `get_sanctions_client()` returns this when `settings.sanctions_adapter_url` is set.

This task's files live in the `api/` codebase (already merged to `main` in an earlier sub-project), not in `sanctions-adapter/`. Work from `api/`'s own venv (`api/.venv`), not `sanctions-adapter/.venv`.

- [ ] **Step 1: Write the failing test `api/tests/test_http_sanctions_client.py`**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `api/`): `pytest tests/test_http_sanctions_client.py -v`
Expected: FAIL — `app.sanctions.http_client` doesn't exist yet.

- [ ] **Step 3: Write `api/app/sanctions/http_client.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_http_sanctions_client.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Add `sanctions_adapter_url` to `api/app/config.py`**

Add this field to the `Settings` class, alongside the existing fields (e.g., after `minio_bucket`):

```python
    sanctions_adapter_url: str | None = None
```

- [ ] **Step 6: Update `api/app/sanctions/dependency.py`**

Replace its contents with:

```python
from app.config import settings
from app.sanctions.client import SanctionsClient
from app.sanctions.fake import FakeSanctionsClient
from app.sanctions.http_client import HttpSanctionsClient


def get_sanctions_client() -> SanctionsClient:
    if settings.sanctions_adapter_url:
        return HttpSanctionsClient(base_url=settings.sanctions_adapter_url)
    return FakeSanctionsClient()
```

- [ ] **Step 7: Run the full `api` suite to confirm nothing regressed**

Run (from `api/`): `pytest -v`
Expected: all existing tests (32, from the prior sub-project) still PASS — `settings.sanctions_adapter_url` is `None` by default, so `get_sanctions_client()` still returns `FakeSanctionsClient` everywhere it's used. Plus the 2 new tests from this task = 34 total, only the one pre-existing, accepted Pydantic `class Config` deprecation warning.

- [ ] **Step 8: Commit**

```bash
git add app/sanctions/http_client.py app/config.py app/sanctions/dependency.py tests/test_http_sanctions_client.py
git commit -m "Add HttpSanctionsClient and wire it behind a config flag"
```
