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
