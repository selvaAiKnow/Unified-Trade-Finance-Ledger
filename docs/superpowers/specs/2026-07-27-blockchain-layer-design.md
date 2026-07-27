# blockchain-layer: Corda RPC Bridge Service — Design

**Phase:** 4 (Smart Contracts) sub-project 1 of 2 — the bridge; the oracle/monitoring
service (`ledger-monitoring`, including auto-payment triggers) is a separate,
later spec that depends on this one.

## Purpose

The CorDapp built in Phase 3 (`CorDapp/contracts`, `CorDapp/workflows`) has only ever
run against Corda's in-memory `MockNetwork` in tests. Nothing outside the JVM test
process can call it. `blockchain-layer` is the bridge that makes the CorDapp reachable
from the rest of the platform: a service that holds real RPC connections to a real,
Docker-deployed Corda network and exposes the 6 milestone flows (plus state reads) as
a plain REST API.

This is Component 6 ("Blockchain Layer") from `docs/claude_code_build_prompt.md`
Section 1: "Anchors document hashes, runs the trade smart contract, maintains the
shared multi-bank ledger. Outputs: on-chain hash, contract state, milestone events."

## Explicitly out of scope for this slice

- **Wiring `api` or the web portal to call `blockchain-layer`.** This is a genuinely
  separate, separately-scoped follow-up: it touches two already-built services
  (`api`, `web`) rather than introducing one new one, and it has to resolve a real
  design gap — `api`'s `TradeStatus` enum (`DRAFT, DOCS_UNDER_REVIEW,
  COMPLIANCE_CLEAR, BANK_REVIEW, ACCEPTED, CLOSED`) does not correspond to the
  CorDapp's milestone enum (`LC_ISSUED, REGULATORY_CLEARED, SHIPPED, ACCEPTED,
  SETTLED, CLOSED`), and nothing in `api` currently transitions trade status at all.
  Reconciling that belongs with the integration work, not this bridge.
- **Dynamic org→Corda-party mapping / multi-bank onboarding.** `blockchain-layer`
  knows about exactly 4 fixed, well-known Corda parties (the same ones the CorDapp's
  own tests use) — not arbitrary `api` organizations. Mapping a dynamic org to a
  Corda identity is Phase 5 ("multi-bank onboarding") territory, and only becomes
  relevant once something calls in using `api`'s org IDs — which nothing does yet.
- **Authentication between services.** Matches the existing, unauthenticated
  `api`→`sanctions-adapter` internal HTTP convention. Nothing in this codebase has
  service-to-service auth yet; introducing it here alone would be inconsistent.
- **Async/queued invocation, Kafka, or any message broker.** `api`→`sanctions-adapter`
  is a plain synchronous HTTP call awaited in the request handler — `blockchain-layer`
  follows the same pattern. Kafka is listed as an aspirational future choice in the
  build doc but nothing in this codebase uses a broker today.
- **The oracle/`ledger-monitoring` service and auto-payment triggers.** Next
  sub-project; depends on this one existing first.
- Real HSM key management, production node-operator concerns (same exclusions the
  CorDapp spec already made).

## Architecture

`blockchain-layer` is a new Kotlin/Ktor service, added as a Gradle module alongside
the existing `contracts`/`workflows` modules under `CorDapp/` — reusing the same
Kotlin/Gradle toolchain already in place rather than introducing a second one, and
staying JVM because Corda's RPC client (`CordaRPCClient`) has no supported Python
binding. This is a deliberate deviation from the "Python FastAPI microservices" stack
listed in `docs/claude_code_build_prompt.md` Section 5 — flagged there as allowed
when there's a strong reason, and "the RPC client is JVM-only" is that reason.

```
blockchain-layer (Ktor, JVM)
  ├── holds 4 RPC connections at startup, one per fixed party:
  │     Importer, Exporter, IssuingBank, AdvisingBank
  ├── REST API (see below) — thin HTTP wrapper over CordaRPCClient calls
  └── talks to a real, Docker-deployed Corda network (not MockNetwork)
```

### Corda network deployment

4 parties + a Notary, generated via Corda's standard `deployNodes` Gradle task
(the tool R3 ships for exactly this — no custom node-bootstrapping code needed),
each running in its own container via Docker Compose, on the same compose network
as `blockchain-layer`'s own container. Same 4-party topology the CorDapp's tests
already use: `Importer/Mumbai/IN`, `Exporter/Mumbai/IN`, `IssuingBank/Tokyo/JP`,
`AdvisingBank/Mumbai/IN`.

No dynamic node provisioning. The RPC host/port/credentials for each of the 4 nodes
are fixed configuration, loaded at `blockchain-layer` startup.

## REST API

Six flow-trigger endpoints, one per CorDapp flow, each a thin wrapper over that
flow's constructor — request bodies are the flow's own parameters, in Corda party
terms (party names, not `api` org IDs):

| Endpoint | Initiating party (fixed, not caller-selectable) | Body |
|---|---|---|
| `POST /flows/issue-lc` | Importer | `{ exporter, issuingBank, advisingBank, lcReference, lcTermsDocumentId, lcTermsHash }` |
| `POST /flows/regulatory-clear` | Exporter | `{ linearId, complianceOutcome, documentId, documentType, onChainHash }` |
| `POST /flows/ship-goods` | Exporter | `{ linearId, documentId, documentType, onChainHash }` |
| `POST /flows/accept-docs` | IssuingBank | `{ linearId }` |
| `POST /flows/settle-payment` | IssuingBank | `{ linearId, documentId, documentType, onChainHash }` |
| `POST /flows/regulatory-close` | Importer | `{ linearId, documentId, documentType, onChainHash }` |

Each handler resolves the fixed RPC connection for that endpoint, calls
`startFlowDynamic(...).returnValue`, and **blocks until the flow completes**
(synchronous, matching `api`'s existing `SanctionsClient.screen()` pattern — no
queue, no polling). On success:

```
201 { linearId, txId, status: "LC_ISSUED" }
```

Read endpoints:

```
GET /trades/{linearId}   → current on-chain TradeFinanceState
                            (status, documentHashes, parties, complianceOutcome)
GET /trades              → all on-chain trades (vault query)
```

Reads always go through the Importer's RPC connection. Importer is a participant
in every trade in this fixed 4-party topology, so its vault always has full
visibility — there's no "viewing party" selection needed.

## Error handling

Corda flow failures map to HTTP status codes rather than leaking raw Corda
exceptions to callers:

| Failure | HTTP status |
|---|---|
| Contract `verify()` rejection (bad input / business-rule violation) | `400` |
| Unknown `linearId` | `404` |
| RPC/connection failure to a node | `502` |

`blockchain-layer` catches `CordaRuntimeException`/`FlowException` at the route
layer and translates.

## Testing

Two tiers:

- **Unit tests** — Ktor's test-application harness against a fake RPC-connection
  interface. No Docker, no real nodes. Covers request validation, error-code
  mapping, and the fixed party→endpoint routing. Fast; runs on every change.
- **Integration tests** — a smaller suite that runs `docker compose up` on the real
  4-node + notary network, drives a full lifecycle (all 6 flows in sequence) through
  the real REST API against real RPC, then tears down. Slower; proves the Docker
  deployment and RPC integration actually work, not just the routing logic.

## Milestone lifecycle (unchanged, for reference)

```
LC_ISSUED → REGULATORY_CLEARED → SHIPPED → ACCEPTED → SETTLED → CLOSED
```

Same 6 milestones, same signer/anchor rules already enforced by
`TradeFinanceContract` (Phase 3) — this service adds no new business logic, only a
real network to run the existing contract/flows against and an HTTP surface to
reach them.
