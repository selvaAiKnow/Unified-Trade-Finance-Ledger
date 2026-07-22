# Claude Code Build Prompt — Blockchain-Integrated Cross-Border Trade Finance Platform

Copy everything below the line into Claude Code as your starting prompt.

---

## Project Brief

Build a **blockchain-integrated cross-border trade finance platform** that digitizes the letter-of-credit (LC) trade finance lifecycle for banks, importers, and exporters. The reference use case is a pharmaceutical export transaction (India → Japan, ICICI Bank ↔ MUFG Bank), but the architecture must generalize to other goods (e.g., textiles, Canara Bank ↔ SMBC) and other instruments (bank guarantees, documentary collection, supply chain finance).

The platform consolidates trade transaction management, document handling, compliance/risk screening, and financing decisions into one system, with a permissioned blockchain layer making document authenticity, compliance outcomes, and settlement records tamper-proof and shareable across all participating banks.

**Design principle (non-negotiable):** Only cryptographic hashes, statuses, and milestone events go on-chain. Never raw documents, PII, or commercially sensitive terms on-chain.

---

## 1. Functional Components (keep all of these — do not drop or merge silently)

Build each as an independently deployable service/module:

1. **Portal Layer** — Role-based dashboards for importer, exporter, and bank staff. Submits trade and document data. Outputs: transaction and document events.
2. **Workflow Orchestration** — Owns transaction state; sequences calls to all other services; handles retries. Outputs: state-change events. (State machine with retry + audit logging.)
3. **Compliance Service** — Sanctions/watchlist screening, KYC validity checks, trade-based money laundering pattern checks. Outputs: CLEAR / REVIEW / BLOCK status.
4. **Risk Scoring Service** — Computes composite country and counterparty credit risk grade. Outputs: Risk grade A–E.
5. **Document Intelligence** — OCR extraction and cross-document consistency checks against LC terms. Outputs: structured data + discrepancy flags.
6. **Blockchain Layer** — Anchors document hashes, runs the trade smart contract, maintains the shared multi-bank ledger. Outputs: on-chain hash, contract state, milestone events.
7. **Decision Engine** — Combines compliance, risk, and document intelligence outputs into an approve/reject/refer decision + financing terms.
8. **Ledger & Monitoring** — Tracks shipment and repayment milestones; feeds milestone events to the smart contract. Outputs: status updates, exception alerts.
9. **External Integrations (adapter layer)** — SWIFT, sanctions lists, credit bureaus, carriers/oracles, core banking systems. Outputs: normalized external data.

Each component should be a separate service (or clearly separated module in a monorepo) communicating via events, not by importing each other's internals.

---

## 2. Document Categories the System Must Model

Documents are polymorphic — model them generically with a `category` and `document_type` field, not hardcoded types:

- **Regulatory / Compliance** (e.g., Drug Manufacturing License, CoPP, WHO-GMP Certificate, Free Sale Certificate, NOC for Export, CoA, BMR extract, Health Certificate, Cold-Chain Certificate)
- **Commercial / Contractual** (Buyer Enquiry/RFQ, Proforma Invoice, Sales Contract, Commercial Invoice, Packing List)
- **Banking / LC** (LC Application, LC SWIFT MT700, LC Advice, Bill of Exchange, Bill Lodgement Form, Forwarding Schedule, Discrepancy Notice, Acceptance Advice MT799/MT499, Payment Advice MT202/MT103)
- **Trade Finance / Credit** (Packing Credit Application, Letter of Hypothecation, Demand Promissory Note, Post-Shipment Finance Adjustment Advice)
- **Shipping / Logistics** (Shipping Bill, Airway Bill/Bill of Lading, Certificate of Origin, Insurance Certificate)
- **Post-Shipment / Settlement** (Export Declaration Form, FIRC, Bank Realization Certificate, EDPMS Closure Entry, Duty Drawback/RoDTEP Claim, GST Refund Application, Export Performance Record)

Each document record needs: `document_id`, `category`, `document_type`, `uploaded_by`, `submitted_to`, `off_chain_storage_ref` (S3/blob pointer), `on_chain_hash`, `verification_status`, `created_at`.

---

## 3. Smart Contract Milestone Lifecycle (implement as the contract's state machine)

```
Milestone 1: LC Issued          → hash(LC terms) anchored, contract deployed, state = LC_ISSUED
Milestone 2: Regulatory Clear    → hash(compliance certs) anchored + regulatory-check flag, state = REGULATORY_CLEARED
Milestone 3: Goods Shipped       → hash(shipping docs) anchored, triggers pre-shipment→post-shipment finance conversion, state = SHIPPED
Milestone 4: Docs Accepted       → issuing bank sign-off recorded, state = ACCEPTED
Milestone 5: Payment Settled     → payment message hash + timestamp anchored, state = SETTLED
Milestone 6: Regulatory Closure  → closure filings hash anchored, state = CLOSED
```

Each milestone transition should be a distinct contract function/endpoint, emit an event, and be callable only by the authorized role for that step (e.g., only the issuing bank can trigger ACCEPTED).

---

## 4. On-Chain vs. Off-Chain Data Model (enforce this boundary in code, not just docs)

| Data | Location | Why |
|---|---|---|
| Full documents (invoice, B/L, certs, etc.) | Off-chain blob storage | Large, confidential |
| Document hash | On-chain | Tamper-evidence |
| Counterparty PII / KYC details | Off-chain, encrypted DB | Privacy law; chains are hard to amend/delete |
| Compliance/risk decision detail | Off-chain | Sensitive scoring inputs |
| Compliance/risk decision outcome (pass/fail) | On-chain | Needed for contract condition checks |
| LC terms and milestones | On-chain (contract state) | Shared source of truth across banks |
| Shipment/customs milestone events | On-chain (via oracle) | Drives automatic contract execution |
| Final settlement record | On-chain | Immutable, shared proof of completion |

Build a data-access layer that makes it structurally hard to accidentally write off-chain-only fields (PII, full documents, commercial terms) into the on-chain client.

---

## 5. Technology Stack (use this unless you have a strong reason to deviate — flag any deviation)

- **Frontend/Portal:** React + Tailwind CSS, MOBX, SSE for live status
- **API Layer:** REST behind an API Gateway with RBAC enforced at the gateway
- **Backend Services:** Python FastAPI microservices — one service per component from Section 1
- **Workflow Orchestration:** Temporal (or AWS Step Functions) — state machine with retry + audit logging
- **Messaging/Events:** Kafka to decouple services
- **Primary Database:** PostgreSQL for transactional data (trades, documents, decisions)
- **Document Storage:** MinIO (self-hosted, S3-compatible) — only hashes go on-chain
- **OCR/Document AI:** AWS Textract / Google Document AI / Azure Form Recognizer, with a human-review fallback UI
- **Sanctions Screening:** Refinitiv World-Check / ComplyAdvantage / OFAC SDN API (async job per transaction)
- **Credit/Country Risk:** Dun & Bradstreet / CRIF / ECA-OECD ratings feeding a weighted risk model
- **Decision/Rules Engine:** A versioned config service (thresholds editable without code deploys)
- **Blockchain Platform:** R3 Corda (permissioned — not a public chain)
- **Smart Contracts:** CorDapps (Corda) encoding LC terms and milestone logic
- **Oracle/Data Feed:** Custom oracle service bridging shipment/customs data on-chain
- **Node Hosting:** Each participating bank runs its own peer node
- **Infra:** Docker + Kubernetes, GitHub Actions/GitLab CI, Prometheus+Grafana or Datadog, OAuth2/OIDC + RBAC, encryption at rest and in transit

---

## 6. Build Order (follow this phased sequence — don't jump ahead)

1. **Phase 1 (Foundation):** Core trade/document data model, portal, manual document upload, single sanctions API integration.
2. **Phase 2 (Automation):** OCR-based document intelligence, rules-based risk scoring, decision engine.
3. **Phase 3 (Blockchain Pilot):** Deploy permissioned network with 2–3 simulated partner banks; document hash anchoring only (no smart contract logic yet).
4. **Phase 4 (Smart Contracts):** Full smart contract lifecycle — milestone tracking, oracle integration, auto payment triggers.
5. **Phase 5 (Scale):** Multi-bank onboarding, ML-based risk scoring, extend to guarantees/supply chain finance.

Start with Phase 1. At the end of each phase, pause and confirm before moving to the next.

---

## 7. Repo Folder Structure (use this exactly — don't propose an alternative)

```
trade-finance-platform -> web -> React application (Portal — Phase 1)

trade-finance-platform -> api -> Core API (Node/NestJS — Transactions, Documents,
                                  Industry Document Registry, Workflow Orchestration — Phase 1)

trade-finance-platform -> sanctions-adapter -> Sanctions API wrapper (Phase 1)

trade-finance-platform -> document-intelligence -> OCR + extraction service (Python/FastAPI — Phase 2)

trade-finance-platform -> compliance-service -> Compliance decisioning service (Phase 2)

trade-finance-platform -> risk-scoring -> Risk grading service (Phase 2)

trade-finance-platform -> decision-engine -> Approve/reject/refer engine (Phase 2)

trade-finance-platform -> blockchain-layer -> Bridge service talking to Corda/Fabric (Phase 3-4)

trade-finance-platform -> ledger-monitoring -> Oracle/milestone feed listener (Phase 4)

trade-finance-platform -> corda -> R3 Corda CorDapp (contracts + workflows, Kotlin/Gradle)

trade-finance-platform -> packages -> Shared code (registry client, shared types, UI components)

trade-finance-platform -> infra -> Docker Compose files, Kubernetes manifests, Postgres migrations

trade-finance-platform -> prototypes -> HTML screen-flow prototype (reference only, not deployed)

trade-finance-platform -> docs -> Registry spec, system design docs, this build prompt
```

Notes on this layout:
- `corda` sits as its own top-level folder, not nested under an `apps` directory — it's Kotlin/Gradle, a different toolchain from everything else, and shouldn't be forced into the same build pipeline as the Node/Python services.
- `packages` holds the shared registry client so every service that reads the Industry Document Registry (Document Intelligence, Compliance Service, web) imports one typed client instead of each hand-rolling its own HTTP calls.
- `prototypes` is deliberately separate from the real services — it's a design reference, never containerized or deployed.
- Only `web`, `api`, and `sanctions-adapter` get built in Phase 1. Everything else is created as an empty scaffold at most, and built out only when its phase arrives.

---

## 8. Non-Functional Requirements

- Permissioned blockchain only — no public/anonymous chain participation.
- Full audit logging on every compliance, risk, and decision event (FATF-aligned).
- No PII or full documents ever written on-chain.
- Key management: private keys per bank node secured via HSM or equivalent (simulate this in dev; document the production requirement).
- Human-review fallback UI for OCR discrepancies and any compliance case flagged REVIEW.

---

## 9. What I want from you first

Before writing code:
1. Scaffold the repo using the folder structure in Section 7 exactly — don't propose an alternative layout.
2. Propose the core data schema (Postgres) for trades, documents, and decisions.
3. Propose the chaincode/CorDapp interface for the Section 3 milestone lifecycle.

Then wait for my confirmation before scaffolding Phase 1.
