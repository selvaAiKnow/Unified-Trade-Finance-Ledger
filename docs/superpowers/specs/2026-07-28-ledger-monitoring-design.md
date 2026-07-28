# ledger-monitoring: Oracle/Milestone Relay Service — Design

**Phase:** 4 (Smart Contracts) sub-project 2 of 2 — the oracle, depending on
`blockchain-layer` (sub-project 1, already built and merged). This completes
Phase 4.

## Purpose

`ledger-monitoring` is Component 8 from `docs/claude_code_build_prompt.md`
Section 1: "Ledger & Monitoring — Tracks shipment and repayment milestones;
feeds milestone events to the smart contract. Outputs: status updates,
exception alerts." It's also where Phase 4's "auto payment triggers" phrase
(from the build doc's Section 6 phase description) lives — settlement is one
of the two milestones this service can trigger.

It's a thin Python/FastAPI service — matching `api`/`sanctions-adapter`'s
stack exactly. Unlike `blockchain-layer`, nothing here needs the Corda RPC
client directly, so there's no reason to deviate from the stated
"Python FastAPI microservices" convention. Its only job: accept a simulated
external signal ("shipment confirmed", "payment confirmed") and relay it to
`blockchain-layer` to advance the corresponding on-chain milestone.

```
external caller (test/script/future carrier-or-bank webhook)
  -> POST ledger-monitoring/events/shipment-confirmed
       -> POST blockchain-layer/flows/ship-goods
            -> (real Corda flow via RPC)
```

`blockchain-layer` was deliberately left standalone (no caller) in its own
phase because wiring it to `api` required reconciling `api`'s `TradeStatus`
enum with the CorDapp's milestone enum — a separately-scoped problem.
`ledger-monitoring` has no such baggage: it speaks `linearId` + document
terms directly, matching `blockchain-layer`'s own vocabulary with no
translation layer. This is the first real caller `blockchain-layer` gets.

## Explicitly out of scope for this slice

- **Real external data feed integration** (carrier APIs, customs systems,
  payment gateways). The two trigger endpoints simulate what those would
  eventually call — this service's REST API stands in for the oracle/data
  feed the build doc describes.
- **Document hashing / storage.** Callers of the trigger endpoints supply a
  pre-computed on-chain hash directly (hex string) — same as how the
  CorDapp's own flow tests always worked. There's no shared document store
  between services in this phase (`api`'s document model and
  `blockchain-layer`'s Corda-party model were never reconciled — see above),
  so `ledger-monitoring` doesn't touch document bytes at all.
- **Event history / audit log / alerting infrastructure.** Stateless relay
  only — no database. An event's outcome is whatever `blockchain-layer`'s
  response says; nothing is persisted locally. Matches the "keep each slice
  minimal and standalone" pattern `blockchain-layer` itself used.
- **Auth between services.** Matches the existing, unauthenticated
  `api`→`sanctions-adapter` internal HTTP convention.
- **Wiring `api`/`web` to call `ledger-monitoring`.** Same reasoning as
  `blockchain-layer`'s own deferral — this is a standalone, directly
  testable service for now, not yet reachable from the portal.
- **The other 4 milestones** (LC Issued, Regulatory Clear, Docs Accepted,
  Regulatory Close). These are bank/compliance actions a human takes
  deliberately — not something an external shipment/customs/payment feed
  would report. Only `Shipped` and `Settled` are in scope.

## API Design

Two trigger endpoints, mirroring `blockchain-layer`'s own field names
exactly:

```
POST /events/shipment-confirmed
{ "linearId": "...", "documentId": "DOC-3", "documentType": "BILL_OF_LADING", "onChainHash": "<64-hex-sha256>" }
  -> calls blockchain-layer POST /flows/ship-goods with the same body
  -> returns blockchain-layer's response verbatim: 201 { linearId, txId, status: "SHIPPED" }

POST /events/payment-confirmed
{ "linearId": "...", "documentId": "DOC-5", "documentType": "MT202", "onChainHash": "<64-hex-sha256>" }
  -> calls blockchain-layer POST /flows/settle-payment with the same body
  -> returns blockchain-layer's response verbatim: 201 { linearId, txId, status: "SETTLED" }
```

## Error Handling

`blockchain-layer` already returns clean `{"error": "..."}` bodies with
meaningful status codes (400 bad input/rejected flow, 404 unknown trade, 502
Corda RPC failure). `ledger-monitoring` propagates those verbatim rather than
reinterpreting them — if `blockchain-layer` says 400, the caller of
`ledger-monitoring` sees 400 with the same body.

The one case `ledger-monitoring` generates itself: if `blockchain-layer` is
unreachable (connection refused/timeout), it returns its own `502` with a
clear message, rather than letting an unhandled connection error surface as
a bare 500.

## Client

A small `BlockchainLayerClient` (async, via `httpx`), configured with a
`blockchain_layer_url` setting (defaults to `http://localhost:8081`,
matching `api`'s existing `sanctions_adapter_url` pattern), injected via
FastAPI's dependency system — same shape as `api`'s existing
`SanctionsClient`/`get_sanctions_client`.

## Testing

Matches the project's established convention (pytest, `api`/
`sanctions-adapter`'s style): unit tests mock `BlockchainLayerClient` (no
real network), asserting each endpoint calls the right `blockchain-layer`
route with the right body and correctly relays both success and error
responses.

No live-network integration test in this slice, unlike `blockchain-layer`
(which had one because it was the thing proving real Corda RPC worked).
`ledger-monitoring`'s own logic is pure request-relay; `blockchain-layer`'s
real behavior is already proven by its own integration test. If real
end-to-end confidence is wanted later, the natural test would run
`ledger-monitoring` against a live `blockchain-layer` (itself against the
live Docker Corda network) and assert a trigger call actually advances
on-chain state — that's deferred, not required for this slice.
