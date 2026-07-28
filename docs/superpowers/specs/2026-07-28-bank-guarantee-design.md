# bank-guarantee: Second Trade-Finance Instrument — Design

**Phase:** 5 (Scale) sub-project 2 of 3 — extending the platform beyond
Letters of Credit. The other two Phase 5 sub-projects (multi-bank
onboarding, already built and merged; ML-based risk scoring) are separately
scoped.

## Purpose

Phase 5 of `docs/claude_code_build_prompt.md` (Section 6) calls for
extending the platform "to guarantees/supply chain finance." Today the
CorDapp models exactly one instrument — a Letter of Credit
(`TradeFinanceState`/`TradeFinanceContract`) — with no discriminator or
abstraction for anything else. This slice adds a second, independent
instrument, a **Bank Guarantee**, proving the platform's model can hold
more than one trade-finance product without disturbing the first.

Guarantees and supply-chain finance are two genuinely different
instruments with different lifecycles (a guarantee has no "goods shipped"
step; supply-chain finance is closer to invoice-approved → financed →
collected). This slice covers Bank Guarantee only — supply-chain finance,
if pursued, gets its own future spec.

## Scope Decisions (from brainstorming)

- **First instrument:** Bank Guarantee — structurally closest to LC (an
  issuing/guarantor bank commits to pay on a triggering event), so it's
  the cleanest first proof that the model generalizes.
- **Lifecycle:** a single linear happy path, matching LC's own scope
  discipline (LC doesn't model rejection/dispute paths either):
  `ISSUED → CLAIM_INVOKED → CLAIM_PAID → CLOSED`. No unclaimed-expiry path.
- **Parties:** reuse the existing 4 Corda parties — `Importer`→applicant,
  `Exporter`→beneficiary, `IssuingBank`→guarantor bank, `AdvisingBank`→
  advising bank. No new node types to provision.
- **Contract architecture:** a wholly separate `GuaranteeState`/
  `GuaranteeContract` (own milestone enum, own document-hash record type,
  own commands) rather than generalizing `TradeFinanceState` with an
  instrument-type discriminator. Zero risk to the already-proven,
  currently-working LC contract; each contract stays small and
  single-purpose. The one confirmed safe reuse: `FlowSupport.kt`'s
  `AbstractTradeFinanceResponder` is genuinely instrument-agnostic (pure
  sign/finalize session plumbing, no `TradeFinanceState`/`Contract`
  references) and is reused as-is by the new Guarantee flows.
- **Scope boundary:** CorDapp/`blockchain-layer` only, matching every
  prior blockchain sub-project this session. No `api`/`web` changes —
  wiring stays deferred, same reasoning as `blockchain-layer` and
  `ledger-monitoring`'s own deferrals.

## Explicitly out of scope for this slice

- Supply-chain finance (a separate, future sub-project).
- An unclaimed-expiry path, amendments, or a dispute path for guarantees.
- Any change to `api`, `web`, or `ledger-monitoring`.
- Generalizing `TradeFinanceState`/`TradeFinanceContract` — they are not
  touched by this slice at all.
- Dynamic bank onboarding beyond what `multi-bank-onboarding` already
  built (this slice reuses that infrastructure, doesn't extend it).

## Architecture

**CorDapp layer** (`CorDapp/contracts/src/main/kotlin/com/utfl/tradefinance/`,
new files alongside the existing LC ones, nothing existing modified):

- `GuaranteeState` (data class): `guaranteeReference: String`,
  `applicant`/`beneficiary`/`guarantorBank`/`advisingBank: Party`,
  `guaranteeTermsHash: SecureHash`, `status: GuaranteeMilestoneStatus`,
  `documentHashes: List<GuaranteeDocumentHashRecord>`, `linearId`.
  `participants` = all four parties, mirroring `TradeFinanceState`.
- `GuaranteeMilestoneStatus`: `ISSUED, CLAIM_INVOKED, CLAIM_PAID, CLOSED`.
- `GuaranteeDocumentHashRecord`: same shape as the existing
  `DocumentHashRecord` but its `milestone` field types to
  `GuaranteeMilestoneStatus` — it cannot reuse `DocumentHashRecord` itself,
  since that type's `milestone` field is hard-typed to the LC-specific
  `TradeMilestoneStatus`.
- `GuaranteeContract`: own `Commands` (`IssueGuarantee`, `InvokeClaim`,
  `PayClaim`, `CloseGuarantee`) and its own private `verifyTransition`-
  shaped helper, structurally mirroring `TradeFinanceContract`'s but
  sharing no code with it. Signers per transition: issue (applicant +
  guarantorBank sign, one `GUARANTEE_TERMS` document anchored),
  invoke-claim (beneficiary + guarantorBank sign, one `CLAIM_NOTICE`
  document anchored), pay-claim (guarantorBank alone signs, mirroring
  `AcceptDocs`'s single-signer shape, one `PAYMENT_MESSAGE` document
  anchored), close (applicant + guarantorBank sign, one `CLOSURE_FILINGS`
  document anchored).

**Workflows** (`CorDapp/workflows/.../flows/`): four new flow objects
(`IssueGuaranteeFlow`, `InvokeClaimFlow`, `PayClaimFlow`,
`CloseGuaranteeFlow`), each an `Initiator`/`Responder` pair mirroring
`IssueLCFlow`'s exact shape. Every `Responder` reuses
`AbstractTradeFinanceResponder` unchanged. A new
`fetchUnconsumedGuaranteeState(linearId)` helper is added to
`FlowSupport.kt` alongside the existing `fetchUnconsumedTradeState` —
purely additive.

**Deployment:** the notary already needs no new configuration — its
`deployNodes` block references `cordapp project(':contracts')`/
`(':workflows')` at the module level, not per-class, so a new class in an
already-referenced module needs no config change. (This matters: an
earlier sub-project discovered the hard way that a validating notary
without the relevant CorDapp attachments cannot notarise transactions that
consume an input state — the module-level reference means this can't
recur for `GuaranteeContract`.)

## REST API & blockchain-layer Integration

A parallel `GuaranteeGateway` interface (own file, mirroring
`CordaGateway`'s shape) with `RealGuaranteeGateway`/`FakeGuaranteeGateway`
implementations — kept separate from `CordaGateway`/`RealCordaGateway`
rather than folding guarantee methods into the existing LC gateway, for
the same isolation reasoning as the CorDapp layer. `RealGuaranteeGateway`
takes the **same shared `RpcConnections`** instance as `RealCordaGateway`
(`Application.kt`'s `main()` constructs one `RpcConnections` and wires
both gateways to it) — no duplicate RPC connections to the same nodes.

`pay-claim` (guarantor-bank-initiated, structurally identical to
`settle-payment`'s "which bank's RPC connection" problem) directly reuses
the bank-pool infrastructure `multi-bank-onboarding` just built: the same
`resolveBank<T>`, `requireKnownBank`, `requireTradeOnBank` top-level
functions already in `RealCordaGateway.kt` (same package, already
generic — no changes needed there), giving `pay-claim` multi-bank routing
for free, with the same optional `guarantorBank: String? = null` field
defaulting to `"IssuingBank"`.

New routes (`GuaranteeRoutes.kt`, mirroring the existing
`FlowRoutes.kt`+`TradeRoutes.kt` split): `POST /flows/issue-guarantee`,
`/flows/invoke-claim`, `/flows/pay-claim`, `/flows/close-guarantee`, plus
`GET /guarantees/{linearId}` and `GET /guarantees`. New DTOs
(`GuaranteeDtos.kt`): request bodies per endpoint, `GuaranteeStateDto` for
reads — `FlowResultResponse`/`ErrorResponse` are already generic and
reused as-is.

## Error Handling

Fully inherited from `Application.kt`'s existing `StatusPages`: a new
`GuaranteeNotFoundException` (mirroring `TradeNotFoundException`) → 404,
plus the existing `FlowRejectedException` → 400, `CordaConnectionException`
→ 502, `IllegalArgumentException` → 400, and catch-all → 500 handlers —
none of which need any changes, since they're already keyed on exception
type, not on which gateway threw them.

## Testing

**CorDapp layer** (discovered during plan-writing, not originally covered
above — the contracts/workflows modules already have a rich test
convention this slice follows): `GuaranteeContractTest.kt`, using the same
`MockServices`/`ledgerServices.ledger{}` DSL as `TradeFinanceContractTest.kt`
— fast, no network, proves each transition's signer/status/document-anchor
rules independently. Guarantee flow tests using `MockNetwork` (mirroring
`AbstractFlowTest.kt`/`IssueLCFlowTest.kt`/`FullLifecycleFlowTest.kt`) —
simulates real party nodes and flow sessions without Docker, proving the
flows and contract integrate correctly before the expensive live-network
test.

**blockchain-layer:** unit tests for `GuaranteeRoutes` against
`FakeGuaranteeGateway` (route wiring, request/response shapes, error
relay) — matching the existing `FlowRoutesTest`/`TradeRoutesTest` pattern
exactly.

A live-network integration test extending `FullLifecycleIT.kt`'s pattern:
a full guarantee lifecycle (issue → invoke-claim → pay-claim → close)
driven through the real REST API against the real Docker Corda network,
proving `GuaranteeContract`'s on-chain verification genuinely works, not
just that the Kotlin compiles. Because `pay-claim` reuses the bank-pool
routing, this test also exercises a non-default guarantor bank (e.g.
`Bank3`) the same way `multi-bank-onboarding`'s `FullLifecycleIT` proved
the LC side — reusing, not re-inventing, that proof pattern.
