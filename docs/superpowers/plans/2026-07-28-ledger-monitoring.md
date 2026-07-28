# ledger-monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `ledger-monitoring`, a thin Python/FastAPI service that relays
simulated "shipment confirmed" / "payment confirmed" oracle events to
`blockchain-layer`'s `ship-goods`/`settle-payment` flow endpoints.

**Architecture:** A `BlockchainLayerClient` Protocol (mirroring `api`'s existing
`SanctionsClient` pattern exactly) with one real implementation
(`HttpBlockchainLayerClient`, using `httpx`) injected via FastAPI's dependency
system. Two POST routes under `/events/` map 1:1 to `blockchain-layer`'s
`ship-goods`/`settle-payment` endpoints, propagating `blockchain-layer`'s
status code and body verbatim on error via FastAPI exception handlers. No
database, no persistence — a pure stateless relay.

**Tech Stack:** Python 3.12, FastAPI 0.115.0, httpx 0.27.2, pydantic 2.9.2,
pydantic-settings 2.5.2, pytest 8.3.3 + pytest-asyncio 0.24.0 — the exact same
versions already pinned in `sanctions-adapter/requirements.txt` and
`api/requirements.txt`.

## Global Constraints

- Only two milestones are in scope: `Shipped` (via `blockchain-layer`'s
  `POST /flows/ship-goods`) and `Settled` (via `POST /flows/settle-payment`).
  No other flow endpoints are wired.
- Request/response JSON field names mirror `blockchain-layer`'s own DTOs
  exactly: `linearId`, `documentId`, `documentType`, `onChainHash` — no
  translation layer, no snake_case-vs-camelCase mismatch left implicit.
- `blockchain-layer`'s error responses (`{"error": "..."}` with 400/404/502)
  are propagated verbatim — same status code, same body — not reinterpreted.
  If `blockchain-layer` itself is unreachable (connection error/timeout),
  `ledger-monitoring` returns its own `502` with a clear message.
- Stateless: no database, no event log, no persistence of any kind. An
  event's outcome is exactly whatever `blockchain-layer`'s response says.
- No authentication between services — matches the existing
  `api`→`sanctions-adapter` internal HTTP convention.
- `blockchain_layer_url` defaults to `http://localhost:8081` (`blockchain-layer`'s
  own default port, set in Task 4 of the `blockchain-layer` plan).
- Frequent commits: one commit per task, after its tests pass.
- No document hashing/storage, no event history/alerting infra, no `api`/`web`
  wiring, no live-network integration test in this plan — all explicitly
  deferred per the design spec.

---

## File Structure

```
ledger-monitoring/
  README.md
  requirements.txt
  requirements-dev.txt
  pytest.ini
  app/
    __init__.py
    main.py                  # FastAPI app, /health, exception handlers, mounts the events router
    config.py                 # Settings: blockchain_layer_url
    schemas.py                 # ShipmentConfirmedRequest, PaymentConfirmedRequest (camelCase aliases)
    blockchain/
      __init__.py
      client.py               # BlockchainLayerClient Protocol, BlockchainLayerError, BlockchainLayerUnreachableError
      http_client.py           # HttpBlockchainLayerClient (httpx-based, real implementation)
      dependency.py            # get_blockchain_layer_client()
    routers/
      __init__.py
      events.py                # POST /events/shipment-confirmed, POST /events/payment-confirmed
  tests/
    test_health.py
    test_http_client.py        # HttpBlockchainLayerClient unit tests via httpx.MockTransport
    fakes.py                   # FakeBlockchainLayerClient test double
    test_events.py             # endpoint tests via FastAPI dependency_overrides
```

---

### Task 1: Project scaffold — health endpoint

**Files:**
- Create: `ledger-monitoring/requirements.txt`
- Create: `ledger-monitoring/requirements-dev.txt`
- Create: `ledger-monitoring/pytest.ini`
- Create: `ledger-monitoring/app/__init__.py`
- Create: `ledger-monitoring/app/config.py`
- Create: `ledger-monitoring/app/main.py`
- Test: `ledger-monitoring/tests/test_health.py`

**Interfaces:**
- Consumes: nothing new
- Produces: a running FastAPI app (`app.main.app`) with `GET /health`, and
  `app.config.settings` (a `Settings` instance with `blockchain_layer_url`)
  — consumed by every later task.

- [ ] **Step 1: Write `requirements.txt`**

Create `ledger-monitoring/requirements.txt`:

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
httpx==0.27.2
pydantic==2.9.2
pydantic-settings==2.5.2
```

- [ ] **Step 2: Write `requirements-dev.txt`**

Create `ledger-monitoring/requirements-dev.txt`:

```
-r requirements.txt
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 3: Write `pytest.ini`**

Create `ledger-monitoring/pytest.ini`:

```ini
[pytest]
pythonpath = .
asyncio_mode = auto
```

- [ ] **Step 4: Create the `app` package**

Create `ledger-monitoring/app/__init__.py` (empty file).

- [ ] **Step 5: Write `app/config.py`**

Create `ledger-monitoring/app/config.py`:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    blockchain_layer_url: str = "http://localhost:8081"

    class Config:
        env_file = ".env"


settings = Settings()
```

- [ ] **Step 6: Write the failing test `tests/test_health.py`**

Create `ledger-monitoring/tests/test_health.py`:

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

- [ ] **Step 7: Run the test to verify it fails**

From `ledger-monitoring/`, with dependencies installed
(`pip install -r requirements-dev.txt` in a venv if not already done):

```bash
pytest tests/test_health.py -v
```

Expected: FAIL/ERROR — `app.main` doesn't exist yet.

- [ ] **Step 8: Write `app/main.py`**

Create `ledger-monitoring/app/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="UTFL Ledger Monitoring")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 9: Run the test to verify it passes**

```bash
pytest tests/test_health.py -v
```

Expected: PASS (1 test).

- [ ] **Step 10: Commit**

```bash
git add requirements.txt requirements-dev.txt pytest.ini app/__init__.py app/config.py app/main.py tests/test_health.py
git commit -m "Scaffold ledger-monitoring with a health endpoint"
```

---

### Task 2: Schemas, `BlockchainLayerClient` Protocol, and exceptions

**Files:**
- Create: `ledger-monitoring/app/schemas.py`
- Create: `ledger-monitoring/app/blockchain/__init__.py`
- Create: `ledger-monitoring/app/blockchain/client.py`

**Interfaces:**
- Consumes: nothing new
- Produces: `ShipmentConfirmedRequest`, `PaymentConfirmedRequest` (pydantic
  models, camelCase JSON aliases), `BlockchainLayerClient` (Protocol with
  `ship_goods`/`settle_payment` methods), `BlockchainLayerError`,
  `BlockchainLayerUnreachableError` — consumed by every later task.

- [ ] **Step 1: Write `app/schemas.py`**

Create `ledger-monitoring/app/schemas.py`:

```python
from pydantic import BaseModel, ConfigDict, Field


class ShipmentConfirmedRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    linear_id: str = Field(alias="linearId")
    document_id: str = Field(alias="documentId")
    document_type: str = Field(alias="documentType")
    on_chain_hash: str = Field(alias="onChainHash")


class PaymentConfirmedRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    linear_id: str = Field(alias="linearId")
    document_id: str = Field(alias="documentId")
    document_type: str = Field(alias="documentType")
    on_chain_hash: str = Field(alias="onChainHash")
```

Both request bodies are identical in shape (mirroring `blockchain-layer`'s
own `ShipGoodsRequest`/`SettlePaymentRequest`, which are also identical) —
kept as two distinct classes rather than one shared one, since they represent
two distinct event *types* even though their fields happen to match today.

- [ ] **Step 2: Create the `blockchain` package**

Create `ledger-monitoring/app/blockchain/__init__.py` (empty file).

- [ ] **Step 3: Write `app/blockchain/client.py`**

Create `ledger-monitoring/app/blockchain/client.py`:

```python
from typing import Any, Protocol


class BlockchainLayerError(Exception):
    """Raised when blockchain-layer responds with a 4xx/5xx status.

    Carries the exact status code and JSON body blockchain-layer returned,
    so the caller of ledger-monitoring can see the same error verbatim.
    """

    def __init__(self, status_code: int, body: dict[str, Any]) -> None:
        super().__init__(f"blockchain-layer returned {status_code}: {body}")
        self.status_code = status_code
        self.body = body


class BlockchainLayerUnreachableError(Exception):
    """Raised when blockchain-layer cannot be reached at all (connection error, timeout)."""


class BlockchainLayerClient(Protocol):
    async def ship_goods(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]: ...

    async def settle_payment(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]: ...
```

- [ ] **Step 4: Verify it imports cleanly**

```bash
python -c "from app.schemas import ShipmentConfirmedRequest, PaymentConfirmedRequest; from app.blockchain.client import BlockchainLayerClient, BlockchainLayerError, BlockchainLayerUnreachableError; print('ok')"
```

Expected: prints `ok`, no import errors. (No behavior to test yet — this
task only adds types, exercised starting in Task 3.)

- [ ] **Step 5: Commit**

```bash
git add app/schemas.py app/blockchain/__init__.py app/blockchain/client.py
git commit -m "Add BlockchainLayerClient protocol, exceptions, and event schemas"
```

---

### Task 3: `HttpBlockchainLayerClient` — real implementation

**Files:**
- Create: `ledger-monitoring/app/blockchain/http_client.py`
- Create: `ledger-monitoring/app/blockchain/dependency.py`
- Test: `ledger-monitoring/tests/test_http_client.py`

**Interfaces:**
- Consumes: `BlockchainLayerClient`, `BlockchainLayerError`,
  `BlockchainLayerUnreachableError` (Task 2), `settings.blockchain_layer_url`
  (Task 1)
- Produces: `HttpBlockchainLayerClient(base_url, transport=None)` implementing
  `BlockchainLayerClient`, `get_blockchain_layer_client()` (a FastAPI
  dependency factory) — consumed by the routes in Tasks 4-5.

- [ ] **Step 1: Write the failing test `tests/test_http_client.py`**

Create `ledger-monitoring/tests/test_http_client.py`:

```python
import httpx
import pytest

from app.blockchain.client import BlockchainLayerError, BlockchainLayerUnreachableError
from app.blockchain.http_client import HttpBlockchainLayerClient


def _handler_returning(status_code: int, json_body: dict):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=json_body)

    return handler


async def test_ship_goods_posts_to_flows_ship_goods_with_camelcase_body():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["body"] = httpx.Request("POST", request.url, content=request.content).content
        import json

        captured["json"] = json.loads(request.content)
        return httpx.Response(201, json={"linearId": "abc-123", "txId": "tx-1", "status": "SHIPPED"})

    transport = httpx.MockTransport(handler)
    client = HttpBlockchainLayerClient(base_url="http://blockchain-layer.test", transport=transport)

    result = await client.ship_goods(
        linear_id="abc-123", document_id="DOC-3", document_type="BILL_OF_LADING", on_chain_hash="AAAA"
    )

    assert captured["path"] == "/flows/ship-goods"
    assert captured["json"] == {
        "linearId": "abc-123",
        "documentId": "DOC-3",
        "documentType": "BILL_OF_LADING",
        "onChainHash": "AAAA",
    }
    assert result == {"linearId": "abc-123", "txId": "tx-1", "status": "SHIPPED"}


async def test_settle_payment_posts_to_flows_settle_payment():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/flows/settle-payment"
        return httpx.Response(201, json={"linearId": "abc-123", "txId": "tx-5", "status": "SETTLED"})

    transport = httpx.MockTransport(handler)
    client = HttpBlockchainLayerClient(base_url="http://blockchain-layer.test", transport=transport)

    result = await client.settle_payment(
        linear_id="abc-123", document_id="DOC-5", document_type="MT202", on_chain_hash="BBBB"
    )

    assert result == {"linearId": "abc-123", "txId": "tx-5", "status": "SETTLED"}


async def test_ship_goods_raises_blockchain_layer_error_on_4xx():
    transport = httpx.MockTransport(_handler_returning(400, {"error": "Contract verification failed"}))
    client = HttpBlockchainLayerClient(base_url="http://blockchain-layer.test", transport=transport)

    with pytest.raises(BlockchainLayerError) as exc_info:
        await client.ship_goods(linear_id="x", document_id="d", document_type="t", on_chain_hash="h")

    assert exc_info.value.status_code == 400
    assert exc_info.value.body == {"error": "Contract verification failed"}


async def test_ship_goods_raises_blockchain_layer_error_on_5xx():
    transport = httpx.MockTransport(_handler_returning(502, {"error": "Could not connect to Corda RPC"}))
    client = HttpBlockchainLayerClient(base_url="http://blockchain-layer.test", transport=transport)

    with pytest.raises(BlockchainLayerError) as exc_info:
        await client.ship_goods(linear_id="x", document_id="d", document_type="t", on_chain_hash="h")

    assert exc_info.value.status_code == 502
    assert exc_info.value.body == {"error": "Could not connect to Corda RPC"}


async def test_ship_goods_raises_unreachable_error_on_connection_failure():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused", request=request)

    transport = httpx.MockTransport(handler)
    client = HttpBlockchainLayerClient(base_url="http://blockchain-layer.test", transport=transport)

    with pytest.raises(BlockchainLayerUnreachableError):
        await client.ship_goods(linear_id="x", document_id="d", document_type="t", on_chain_hash="h")
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pytest tests/test_http_client.py -v
```

Expected: FAIL/ERROR — `app.blockchain.http_client` doesn't exist yet.

- [ ] **Step 3: Write `app/blockchain/http_client.py`**

Create `ledger-monitoring/app/blockchain/http_client.py`:

```python
from typing import Any

import httpx

from app.blockchain.client import BlockchainLayerError, BlockchainLayerUnreachableError


class HttpBlockchainLayerClient:
    def __init__(self, base_url: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._base_url = base_url
        self._transport = transport

    async def ship_goods(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]:
        return await self._post_flow(
            "/flows/ship-goods",
            {
                "linearId": linear_id,
                "documentId": document_id,
                "documentType": document_type,
                "onChainHash": on_chain_hash,
            },
        )

    async def settle_payment(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]:
        return await self._post_flow(
            "/flows/settle-payment",
            {
                "linearId": linear_id,
                "documentId": document_id,
                "documentType": document_type,
                "onChainHash": on_chain_hash,
            },
        )

    async def _post_flow(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(base_url=self._base_url, transport=self._transport, timeout=10.0) as client:
                response = await client.post(path, json=payload)
        except httpx.RequestError as exc:
            raise BlockchainLayerUnreachableError(str(exc)) from exc

        if response.status_code >= 400:
            raise BlockchainLayerError(status_code=response.status_code, body=response.json())
        return response.json()
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pytest tests/test_http_client.py -v
```

Expected: PASS (5 tests).

- [ ] **Step 5: Write `app/blockchain/dependency.py`**

Create `ledger-monitoring/app/blockchain/dependency.py`:

```python
from app.blockchain.client import BlockchainLayerClient
from app.blockchain.http_client import HttpBlockchainLayerClient
from app.config import settings


def get_blockchain_layer_client() -> BlockchainLayerClient:
    return HttpBlockchainLayerClient(base_url=settings.blockchain_layer_url)
```

- [ ] **Step 6: Verify it imports cleanly**

```bash
python -c "from app.blockchain.dependency import get_blockchain_layer_client; print(get_blockchain_layer_client())"
```

Expected: prints an `HttpBlockchainLayerClient` instance, no errors.

- [ ] **Step 7: Commit**

```bash
git add app/blockchain/http_client.py app/blockchain/dependency.py tests/test_http_client.py
git commit -m "Add HttpBlockchainLayerClient with real HTTP error mapping"
```

---

### Task 4: `POST /events/shipment-confirmed`

**Files:**
- Create: `ledger-monitoring/tests/fakes.py`
- Create: `ledger-monitoring/app/routers/__init__.py`
- Create: `ledger-monitoring/app/routers/events.py`
- Modify: `ledger-monitoring/app/main.py`
- Test: `ledger-monitoring/tests/test_events.py`

**Interfaces:**
- Consumes: `BlockchainLayerClient`, `BlockchainLayerError`,
  `BlockchainLayerUnreachableError` (Task 2), `get_blockchain_layer_client`
  (Task 3), `ShipmentConfirmedRequest` (Task 2)
- Produces: `FakeBlockchainLayerClient` (test double, used by every later
  route test too), `POST /events/shipment-confirmed`, the exception-handler
  wiring in `main.py` that Task 5's route also relies on.

- [ ] **Step 1: Write `tests/fakes.py`**

Create `ledger-monitoring/tests/fakes.py`:

```python
from typing import Any


class FakeBlockchainLayerClient:
    def __init__(self) -> None:
        self.ship_goods_result: dict[str, Any] | None = None
        self.ship_goods_error: Exception | None = None
        self.last_ship_goods_args: tuple | None = None

        self.settle_payment_result: dict[str, Any] | None = None
        self.settle_payment_error: Exception | None = None
        self.last_settle_payment_args: tuple | None = None

    async def ship_goods(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]:
        self.last_ship_goods_args = (linear_id, document_id, document_type, on_chain_hash)
        if self.ship_goods_error:
            raise self.ship_goods_error
        assert self.ship_goods_result is not None, "ship_goods_result not configured"
        return self.ship_goods_result

    async def settle_payment(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]:
        self.last_settle_payment_args = (linear_id, document_id, document_type, on_chain_hash)
        if self.settle_payment_error:
            raise self.settle_payment_error
        assert self.settle_payment_result is not None, "settle_payment_result not configured"
        return self.settle_payment_result
```

- [ ] **Step 2: Write the failing test `tests/test_events.py`**

Create `ledger-monitoring/tests/test_events.py`:

```python
from httpx import ASGITransport, AsyncClient

from app.blockchain.client import BlockchainLayerError, BlockchainLayerUnreachableError
from app.blockchain.dependency import get_blockchain_layer_client
from app.main import app
from tests.fakes import FakeBlockchainLayerClient


async def _post(path: str, json_body: dict, fake_client: FakeBlockchainLayerClient):
    app.dependency_overrides[get_blockchain_layer_client] = lambda: fake_client
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post(path, json=json_body)
    finally:
        app.dependency_overrides.clear()


async def test_shipment_confirmed_calls_ship_goods_and_returns_the_result():
    fake_client = FakeBlockchainLayerClient()
    fake_client.ship_goods_result = {"linearId": "abc-123", "txId": "tx-1", "status": "SHIPPED"}

    response = await _post(
        "/events/shipment-confirmed",
        {"linearId": "abc-123", "documentId": "DOC-3", "documentType": "BILL_OF_LADING", "onChainHash": "AAAA"},
        fake_client,
    )

    assert response.status_code == 201
    assert response.json() == {"linearId": "abc-123", "txId": "tx-1", "status": "SHIPPED"}
    assert fake_client.last_ship_goods_args == ("abc-123", "DOC-3", "BILL_OF_LADING", "AAAA")


async def test_shipment_confirmed_relays_blockchain_layer_error_verbatim():
    fake_client = FakeBlockchainLayerClient()
    fake_client.ship_goods_error = BlockchainLayerError(status_code=400, body={"error": "Contract verification failed"})

    response = await _post(
        "/events/shipment-confirmed",
        {"linearId": "abc-123", "documentId": "DOC-3", "documentType": "BILL_OF_LADING", "onChainHash": "AAAA"},
        fake_client,
    )

    assert response.status_code == 400
    assert response.json() == {"error": "Contract verification failed"}


async def test_shipment_confirmed_returns_502_when_blockchain_layer_unreachable():
    fake_client = FakeBlockchainLayerClient()
    fake_client.ship_goods_error = BlockchainLayerUnreachableError("Connection refused")

    response = await _post(
        "/events/shipment-confirmed",
        {"linearId": "abc-123", "documentId": "DOC-3", "documentType": "BILL_OF_LADING", "onChainHash": "AAAA"},
        fake_client,
    )

    assert response.status_code == 502
    assert "Connection refused" in response.json()["error"]
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pytest tests/test_events.py -v
```

Expected: FAIL — `app.routers.events` doesn't exist yet (404s / import errors).

- [ ] **Step 4: Create the `routers` package**

Create `ledger-monitoring/app/routers/__init__.py` (empty file).

- [ ] **Step 5: Write `app/routers/events.py`**

Create `ledger-monitoring/app/routers/events.py`:

```python
from typing import Any

from fastapi import APIRouter, Depends, status

from app.blockchain.client import BlockchainLayerClient
from app.blockchain.dependency import get_blockchain_layer_client
from app.schemas import PaymentConfirmedRequest, ShipmentConfirmedRequest

router = APIRouter(prefix="/events", tags=["events"])


@router.post("/shipment-confirmed", status_code=status.HTTP_201_CREATED)
async def shipment_confirmed(
    payload: ShipmentConfirmedRequest,
    client: BlockchainLayerClient = Depends(get_blockchain_layer_client),
) -> dict[str, Any]:
    return await client.ship_goods(
        linear_id=payload.linear_id,
        document_id=payload.document_id,
        document_type=payload.document_type,
        on_chain_hash=payload.on_chain_hash,
    )


@router.post("/payment-confirmed", status_code=status.HTTP_201_CREATED)
async def payment_confirmed(
    payload: PaymentConfirmedRequest,
    client: BlockchainLayerClient = Depends(get_blockchain_layer_client),
) -> dict[str, Any]:
    return await client.settle_payment(
        linear_id=payload.linear_id,
        document_id=payload.document_id,
        document_type=payload.document_type,
        on_chain_hash=payload.on_chain_hash,
    )
```

(Both routes are written in this task even though the plan only requires
`/shipment-confirmed` here — they're identical in shape and splitting them
across two files/steps would add no real isolation. Task 5 adds the test
coverage for `/payment-confirmed` and does the cross-service manual
verification; the route itself already exists after this step.)

- [ ] **Step 6: Wire the router and exception handlers into `app/main.py`**

Replace `ledger-monitoring/app/main.py`:

```python
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.blockchain.client import BlockchainLayerError, BlockchainLayerUnreachableError
from app.routers import events

app = FastAPI(title="UTFL Ledger Monitoring")
app.include_router(events.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(BlockchainLayerError)
async def blockchain_layer_error_handler(request: Request, exc: BlockchainLayerError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.body)


@app.exception_handler(BlockchainLayerUnreachableError)
async def blockchain_layer_unreachable_handler(
    request: Request, exc: BlockchainLayerUnreachableError
) -> JSONResponse:
    return JSONResponse(status_code=502, content={"error": f"blockchain-layer unreachable: {exc}"})
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pytest tests/ -v
```

Expected: PASS — all tests from Tasks 1, 3, and this task (health: 1,
http_client: 5, events: 3 = 9 total).

- [ ] **Step 8: Commit**

```bash
git add tests/fakes.py app/routers/__init__.py app/routers/events.py app/main.py tests/test_events.py
git commit -m "Add POST /events/shipment-confirmed with verbatim error relay"
```

---

### Task 5: `POST /events/payment-confirmed` and manual cross-service verification

**Files:**
- Modify: `ledger-monitoring/tests/test_events.py`

**Interfaces:**
- Consumes: `client.settle_payment` (already implemented in
  `app/routers/events.py` since Task 4), `PaymentConfirmedRequest` (Task 2)
- Produces: nothing new for later tasks — this task adds test coverage for
  the already-implemented route and does a real cross-service check.

- [ ] **Step 1: Add the failing tests to `tests/test_events.py`**

Add this helper and these three test functions to
`ledger-monitoring/tests/test_events.py` (the route itself already exists
from Task 4 — these tests are what's missing):

```python
async def _post_payment(json_body: dict, fake_client: FakeBlockchainLayerClient):
    return await _post("/events/payment-confirmed", json_body, fake_client)


async def test_payment_confirmed_calls_settle_payment_and_returns_the_result():
    fake_client = FakeBlockchainLayerClient()
    fake_client.settle_payment_result = {"linearId": "abc-123", "txId": "tx-5", "status": "SETTLED"}

    response = await _post_payment(
        {"linearId": "abc-123", "documentId": "DOC-5", "documentType": "MT202", "onChainHash": "BBBB"},
        fake_client,
    )

    assert response.status_code == 201
    assert response.json() == {"linearId": "abc-123", "txId": "tx-5", "status": "SETTLED"}
    assert fake_client.last_settle_payment_args == ("abc-123", "DOC-5", "MT202", "BBBB")


async def test_payment_confirmed_relays_blockchain_layer_error_verbatim():
    fake_client = FakeBlockchainLayerClient()
    fake_client.settle_payment_error = BlockchainLayerError(status_code=404, body={"error": "No trade found"})

    response = await _post_payment(
        {"linearId": "abc-123", "documentId": "DOC-5", "documentType": "MT202", "onChainHash": "BBBB"},
        fake_client,
    )

    assert response.status_code == 404
    assert response.json() == {"error": "No trade found"}


async def test_payment_confirmed_returns_502_when_blockchain_layer_unreachable():
    fake_client = FakeBlockchainLayerClient()
    fake_client.settle_payment_error = BlockchainLayerUnreachableError("Connection refused")

    response = await _post_payment(
        {"linearId": "abc-123", "documentId": "DOC-5", "documentType": "MT202", "onChainHash": "BBBB"},
        fake_client,
    )

    assert response.status_code == 502
    assert "Connection refused" in response.json()["error"]
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
pytest tests/ -v
```

Expected: PASS — 12 tests total (health: 1, http_client: 5, events: 6).

- [ ] **Step 3: Manual cross-service verification against a real, running `blockchain-layer`**

This plan deliberately has no automated live-network integration test (see
Global Constraints) — `blockchain-layer`'s own integration test already
proves the Corda side works, and `ledger-monitoring`'s logic is pure
request-relay. But before calling this plan done, verify the wiring is
genuinely correct against the real service once, by hand:

Bring up the real network (from `CorDapp/docker/`):

```bash
docker compose up -d --build
```

Wait for `blockchain-layer` to report healthy (poll `/health` — it can take
35-60s on a cold start per `blockchain-layer`'s own README):

```bash
until curl -sf http://localhost:8081/health; do sleep 5; done
```

Issue an LC directly against `blockchain-layer` first (there's no
`issue-lc`-triggering event in `ledger-monitoring`'s scope, so this step
uses `blockchain-layer`'s own API to get a `linearId` to work with):

```bash
curl -X POST http://localhost:8081/flows/issue-lc \
  -H 'Content-Type: application/json' \
  -d '{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-VERIFY-1","lcTermsDocumentId":"DOC-1","lcTermsHash":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'
```

Note the `linearId` from the response, then advance it to `REGULATORY_CLEARED`
(a prerequisite for `ship-goods`):

```bash
curl -X POST http://localhost:8081/flows/regulatory-clear \
  -H 'Content-Type: application/json' \
  -d '{"linearId":"<linearId from above>","complianceOutcome":"CLEAR","documentId":"DOC-2","documentType":"WHO_GMP_CERTIFICATE","onChainHash":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}'
```

In a separate terminal, from `ledger-monitoring/`, start the service itself
(pointed at the real `blockchain-layer`, which is the default):

```bash
uvicorn app.main:app --port 8090
```

Now drive the two events this plan actually adds, through `ledger-monitoring`,
not `blockchain-layer` directly:

```bash
curl -X POST http://localhost:8090/events/shipment-confirmed \
  -H 'Content-Type: application/json' \
  -d '{"linearId":"<linearId>","documentId":"DOC-3","documentType":"BILL_OF_LADING","onChainHash":"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"}'
# Expected: 201 { "linearId": "...", "txId": "...", "status": "SHIPPED" }

curl -X POST http://localhost:8090/events/payment-confirmed \
  -H 'Content-Type: application/json' \
  -d '{"linearId":"<linearId>","documentId":"DOC-5","documentType":"MT202","onChainHash":"DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"}'
# Expected: 201 { "linearId": "...", "txId": "...", "status": "SETTLED" }
```

Wait — `ship-goods` requires the state to be `REGULATORY_CLEARED` first
(the `curl` calls above already did that), and `settle-payment` requires
`ACCEPTED` — the CorDapp's contract enforces the full milestone order, and
this plan's two events skip `accept-docs`. So the second `curl` above (
`payment-confirmed`) is expected to FAIL with a `400` from
`blockchain-layer`'s own contract verification (relayed verbatim by
`ledger-monitoring`) — this is correct behavior, not a bug: it proves the
error-relay path works end-to-end with a real error, not just a
`FakeBlockchainLayerClient`-simulated one. To see a real `201` success for
`payment-confirmed`, first advance the trade to `ACCEPTED` via
`blockchain-layer` directly:

```bash
curl -X POST http://localhost:8081/flows/accept-docs \
  -H 'Content-Type: application/json' \
  -d '{"linearId":"<linearId>"}'
```

then retry the `payment-confirmed` call above — it should now return `201`
with `status: "SETTLED"`.

Confirm both the success path (`shipment-confirmed` → 201 SHIPPED) and the
real-error relay path (`payment-confirmed` called out of order → the same
400 body `blockchain-layer` itself would return) actually happened, by
reading the responses — not just that the commands ran without a shell
error.

Tear down:

```bash
docker compose down
```

(from `CorDapp/docker/`), and stop the `uvicorn` process.

This step has no code changes and produces no new commit — it's a
verification gate before Step 4.

- [ ] **Step 4: Commit**

```bash
git add tests/test_events.py
git commit -m "Add payment-confirmed test coverage"
```

---

### Task 6: README

**Files:**
- Create: `ledger-monitoring/README.md`

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by other tasks — documentation only, final task
  of this plan.

- [ ] **Step 1: Write `README.md`**

Create `ledger-monitoring/README.md`:

```markdown
# ledger-monitoring

A thin FastAPI service relaying simulated "oracle" events (shipment
confirmed, payment confirmed) to `blockchain-layer`'s Corda flow endpoints.
See `docs/superpowers/specs/2026-07-28-ledger-monitoring-design.md` for the
design.

This is a standalone service in this phase: nothing in `api`/`web` calls it
yet. It's the first real caller `blockchain-layer` gets — everything else in
the platform still calls `blockchain-layer` (if at all) directly.

Stateless: no database. Every request is relayed to `blockchain-layer` and
its response (success or error) is returned as-is.

## Requirements

- Python 3.12
- A running `blockchain-layer` instance (see `CorDapp/blockchain-layer/README.md`)
  to actually exercise this against anything real — this service's own unit
  tests don't need it (they mock the client).

## Setup

```bash
cd ledger-monitoring
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements-dev.txt
```

## Run

```bash
uvicorn app.main:app --port 8090
```

Defaults to calling `blockchain-layer` at `http://localhost:8081` — override
with the `BLOCKCHAIN_LAYER_URL` environment variable (or a `.env` file) if
it's running elsewhere.

## Example

```bash
curl -X POST http://localhost:8090/events/shipment-confirmed \
  -H 'Content-Type: application/json' \
  -d '{"linearId":"<linearId>","documentId":"DOC-3","documentType":"BILL_OF_LADING","onChainHash":"<64-hex-char-sha256>"}'
```

`blockchain-layer`'s response (success or error, same status code and body)
is returned verbatim. See `app/routers/events.py` for the other event type
(`/events/payment-confirmed`).

## Build and test

```bash
pytest tests/ -v
```

Fast — no Docker, no live network. `tests/test_http_client.py` verifies the
real HTTP client's request shape and error mapping against a mocked
transport; `tests/test_events.py` verifies the routes against a hand-written
fake client.

## Module layout

- `app/blockchain/` — `BlockchainLayerClient` protocol, the real
  `HttpBlockchainLayerClient`, and the FastAPI dependency factory.
- `app/routers/events.py` — the two trigger endpoints.
- `app/schemas.py` — request models (camelCase JSON, matching
  `blockchain-layer`'s own field names exactly).

## Not in scope for this service (see the design spec)

- Real external data feed integration (carrier APIs, customs, payment
  gateways) — these two endpoints simulate what those would call.
- Document hashing/storage — callers supply pre-computed hashes.
- Event history, audit log, or alerting infrastructure.
- Auth between services.
- Wiring `api`/`web` to call this service.
- The other 4 CorDapp milestones (LC Issued, Regulatory Clear, Docs
  Accepted, Regulatory Close) — human/bank-triggered, not oracle-triggered.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add ledger-monitoring README"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** purpose/position (Task 1's scaffold + README), the two
  trigger endpoints with exact field names (Tasks 4-5), verbatim error relay
  including the unreachable case (Tasks 3-5), stateless/no-persistence
  (verified by absence of any DB dependency anywhere in this plan), no
  live-network automated test (explicitly not added; Task 5 substitutes a
  one-time manual verification instead, per the design's own stated
  trade-off) — all covered.
- **Type consistency:** `BlockchainLayerClient.ship_goods`/`.settle_payment`
  signatures (Task 2) match `HttpBlockchainLayerClient` (Task 3) and
  `FakeBlockchainLayerClient` (Task 4) exactly — same parameter names/order
  in all three. `ShipmentConfirmedRequest`/`PaymentConfirmedRequest` field
  names (Task 2) match what `app/routers/events.py` (Task 4) reads from
  `payload.*` exactly.
- **Field-name/alias risk:** `ConfigDict(populate_by_name=True)` on both
  request schemas is deliberate — it lets tests (Task 3/4/5) construct real
  Python objects by snake_case name if ever needed while the wire format
  stays camelCase via `Field(alias=...)`. FastAPI's request parsing uses the
  alias by default, matching the JSON bodies shown in every test.
