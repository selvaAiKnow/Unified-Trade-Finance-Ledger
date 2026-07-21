# Trade Finance CorDapp — Design

Date: 2026-07-21
Source: `claude_code_build_prompt.md` (Blockchain-Integrated Cross-Border Trade Finance Platform)

## Scope

This is the **Corda-only slice** of the full 9-component platform described in the
source document. It implements just the Blockchain Layer (Section 1, component 6)
and, specifically, the Section 3 smart-contract milestone lifecycle for a
letter-of-credit (LC) trade.

**Explicitly out of scope for this project:** Portal, Workflow Orchestration,
Compliance Service, Risk Scoring Service, Document Intelligence, Decision Engine,
Ledger & Monitoring, External Integrations. Those are future services that would
call into this CorDapp's flows (e.g., via RPC) once built — none of their logic or
infrastructure is scaffolded here. There is no oracle service; milestone
transitions are triggered by explicit flow calls from the authorized on-ledger
party, not by an automated external feed.

**Reference use case:** India → Japan pharmaceutical export LC (matches the source
doc's example), but the state/contract/flow design is generic across goods and LC
instruments — nothing pharma-specific is hardcoded.

## Platform choices

- **Corda 4.x** (open source), not Corda 5 — mature tooling, classic
  States/Contracts/Flows model, runs via Gradle + `MockNetwork` with no
  extra infra.
- **Kotlin** for all contract and flow code.
- Validated via **`MockNetwork` tests only** — no real multi-node deployment
  (`deployNodes`) in this slice. A real network can be generated later from the
  same contracts/workflows modules without redesign.

## On-chain / off-chain boundary

Per the source doc's Section 4 table, this CorDapp only ever holds: cryptographic
hashes, milestone status, the four bank/party identities, and a compliance
**outcome** flag (CLEAR/REVIEW/BLOCK) — never full documents, PII, off-chain
storage references, or compliance/risk scoring detail. This is enforced by type
shape, not convention: `DocumentHashRecord` (see below) has no field to hold an
off-chain storage reference or an uploader identity, so there is nowhere for that
data to go even by accident.

## Project layout

Standard Corda 4 two-module Gradle layout:

```
utfl-trade-finance-cordapp/
├── contracts/                          # States + Contracts, no flow logic
│   └── src/main/kotlin/.../
│       ├── TradeFinanceState.kt
│       ├── TradeFinanceContract.kt
│       ├── TradeMilestoneStatus.kt     # enum
│       ├── ComplianceOutcome.kt        # enum
│       └── DocumentHashRecord.kt       # embedded data class
├── contracts/src/test/kotlin/.../      # Contract (ledger DSL) tests
├── workflows/                          # Flows (Initiator/Responder per milestone)
│   └── src/main/kotlin/.../flows/
│       ├── IssueLCFlow.kt
│       ├── RegulatoryClearFlow.kt
│       ├── ShipGoodsFlow.kt
│       ├── AcceptDocsFlow.kt
│       ├── SettlePaymentFlow.kt
│       └── RegulatoryCloseFlow.kt
├── workflows/src/test/kotlin/.../      # MockNetwork flow tests
├── build.gradle / settings.gradle / gradle.properties
└── README.md
```

`contracts` ships to every node as the shared "constitution"; `workflows` holds
party-specific flow logic. No client/webserver module — nothing outside the
CorDapp is being built here.

## Data model

### `TradeFinanceState` (LinearState)

One instance per LC, evolving through all six milestones (input consumed, new
version output at each transition).

| Field | Type | Notes |
|---|---|---|
| `linearId` | `UniqueIdentifier` | stable identity across all state versions |
| `lcReference` | `String` | LC number, e.g. SWIFT MT700 reference |
| `importer` | `Party` | on-ledger participant |
| `exporter` | `Party` | on-ledger participant |
| `issuingBank` | `Party` | importer's bank, on-ledger participant |
| `advisingBank` | `Party` | exporter's bank, on-ledger participant |
| `lcTermsHash` | `SecureHash` | anchored at Milestone 1, immutable thereafter |
| `status` | `TradeMilestoneStatus` | see state machine below |
| `complianceOutcome` | `ComplianceOutcome?` | `CLEAR` / `REVIEW` / `BLOCK`, set at Milestone 2; outcome only, no scoring detail |
| `documentHashes` | `List<DocumentHashRecord>` | append-only across milestones |
| `participants` | derived | all four parties, regardless of who is a required signer on a given transition |

`linearId` and the four party fields are immutable across every version of the
state — enforced in the contract.

### `DocumentHashRecord` (embedded data class, not a separate state)

| Field | Type |
|---|---|
| `documentId` | `String` |
| `category` | `String` |
| `documentType` | `String` |
| `onChainHash` | `SecureHash` |
| `milestone` | `TradeMilestoneStatus` (which milestone this was anchored under) |
| `anchoredAt` | `Instant` |

Deliberately excludes `uploadedBy`, `submittedTo`, `offChainStorageRef`, and
`verificationStatus` detail from the source doc's full document schema — those
stay in the off-chain system (Postgres + blob storage) that this CorDapp doesn't
own.

### `TradeMilestoneStatus` (enum, linear state machine)

```
LC_ISSUED → REGULATORY_CLEARED → SHIPPED → ACCEPTED → SETTLED → CLOSED
```

No skipping forward, no moving backward — enforced in `TradeFinanceContract`.

## Milestone → command → signer → anchoring mapping

| # | Milestone | Contract command | Required signers | Anchoring behavior |
|---|---|---|---|---|
| 1 | LC Issued | `IssueLC` | Importer, Issuing Bank | appends `DocumentHashRecord` (category `LC_TERMS`); sets `lcTermsHash` |
| 2 | Regulatory Cleared | `RegulatoryClear` | Exporter, Advising Bank | appends record (category `COMPLIANCE_CERTS`); sets `complianceOutcome` |
| 3 | Goods Shipped | `ShipGoods` | Exporter, Advising Bank | appends record (category `SHIPPING_DOCS`) |
| 4 | Docs Accepted | `AcceptDocs` | Issuing Bank only | pure sign-off — status transition only, no new hash |
| 5 | Payment Settled | `SettlePayment` | Issuing Bank, Advising Bank | appends record (category `PAYMENT_MESSAGE`) |
| 6 | Regulatory Closure | `RegulatoryClose` | Importer, Issuing Bank | appends record (category `CLOSURE_FILINGS`) |

Anchoring is implemented generically in the contract (not one-off per milestone):
each command that anchors something requires the new state's `documentHashes` to
contain at least one new record whose `category` matches that milestone's expected
category and whose `milestone` field matches the target status.

## Flows

One `Initiator`/`Responder` pair per milestone (six pairs), following a common
shape:

1. Initiator (one of the milestone's required signers) builds a transaction:
   input = current `TradeFinanceState` (`IssueLCFlow` has no input, output only),
   output = new state with `status` advanced and any required `DocumentHashRecord`
   appended.
2. Command = the matching `TradeFinanceContract.Commands` subtype, signers = the
   table above.
3. `CollectSignaturesFlow` gathers the other required signer's signature; the
   responder flow signs after `SignedTransactionFlow` re-runs contract `verify()`
   — no separate business-logic check in the flow, since all rules live in the
   contract.
4. `FinalityFlow` broadcasts the finalized transaction to **all four parties**
   (`participants` on the state), even ones not required to sign that particular
   transition, so every bank/importer/exporter on the trade always has the full
   current history.

## Contract rules (`TradeFinanceContract.verify`)

- Command-specific signer requirements per the table above.
- `status` transitions must follow the exact sequence; no skips, no reversals.
- `linearId`, `importer`, `exporter`, `issuingBank`, `advisingBank` must be
  identical between input and output states.
- For anchoring commands (1, 2, 3, 5, 6): output `documentHashes` must be a
  superset of input `documentHashes` plus at least one new record with the
  expected `category` and `milestone`.
- For `AcceptDocs`: `documentHashes` must be unchanged from input to output.
- `IssueLC` has no input state; all other commands require exactly one input and
  one output `TradeFinanceState`.

## Testing

- **Contract tests** (`contracts` module, JUnit + Corda `ledger { }` DSL):
  - Each valid transition is accepted with the correct signers.
  - Each transition is rejected when a required signer is missing.
  - Out-of-order or skipped milestone transitions are rejected.
  - Attempts to mutate `linearId` or any of the four party fields are rejected.
  - Anchoring commands are rejected if no new record, or a record with the wrong
    category/milestone, is present.
  - `AcceptDocs` is rejected if `documentHashes` changes.
- **Flow tests** (`workflows` module, `MockNetwork`, 4 nodes + 1 notary):
  - Drive one trade through the full six-milestone lifecycle end-to-end.
  - Assert final vault state matches on all four nodes.
  - Assert a party not required to sign a given transition still receives the
    finalized transaction (vault query confirms visibility).

## Non-functional notes carried from the source doc

- Permissioned network only — no public/anonymous chain participation (the
  4-party + notary topology is inherently permissioned; nothing further to build
  for this slice).
- No PII, no full documents, no off-chain storage references ever modeled in a
  Corda state — enforced by the `DocumentHashRecord` shape itself.
- Key management (HSM etc.) is a production node-operator concern, out of scope
  for this dev-time, `MockNetwork`-validated slice.

## Explicitly deferred to later work

- Real multi-node deployment (`deployNodes`, Docker Compose, actual RPC clients).
- Oracle integration for automated shipment/customs-triggered milestones (source
  doc's Phase 4).
- Any of the other 8 platform components (portal, orchestration, compliance,
  risk, OCR, decision engine, monitoring, external integrations) — this CorDapp
  is the piece they would eventually call into.
