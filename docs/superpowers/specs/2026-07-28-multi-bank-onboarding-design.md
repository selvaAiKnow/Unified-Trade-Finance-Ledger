# multi-bank-onboarding: Configurable N-Bank Pool — Design

**Phase:** 5 (Scale) sub-project 1 of 3 — multi-bank onboarding. The other two
Phase 5 sub-projects (ML-based risk scoring, extend to guarantees/supply
chain finance) are separately scoped, not part of this slice.

## Purpose

Phase 5 of `docs/claude_code_build_prompt.md` (Section 6) calls for
"multi-bank onboarding." Today the Corda network is hardcoded to exactly
one issuing bank and one advising bank (`IssuingBank`, `AdvisingBank` in
`CorDapp/build.gradle`'s `deployNodes`). This slice generalizes the network
to a configurable pool of banks, so a trade can be issued between any two
banks in the pool — not just the one fixed pair — proving the platform can
actually onboard additional banks rather than merely naming the concept.

## Scope Decisions (from brainstorming)

- **Onboarding model:** configurable node set, redeploy to add. Not a
  dynamic runtime-join network membership service (Corda Network
  Map/doorman/CA) — that's production-grade PKI infrastructure far beyond
  this slice. Adding a bank means adding a config entry and redeploying the
  Docker Compose network, same operational pattern already used for every
  CorDapp change this project has made.
- **Topology:** the bank *pool* grows (4 banks total); each individual
  trade still has exactly two bank roles (issuing, advising), matching the
  CorDapp's existing `TradeFinanceState`/`TradeFinanceContract` shape. No
  contract/workflow redesign for N-banks-per-trade (that would be a much
  larger change with no current requirement driving it).
- **API integration:** CorDapp/`blockchain-layer`-only, matching the
  standalone-service pattern of every Phase 3/4 sub-project. No changes to
  `api`'s `Organization` model or any api↔Corda identity mapping.
- **Bank selection:** the caller specifies both banks by name per trade
  (already how `issue-lc` works today) rather than deriving them from
  on-chain state lookups.

## Explicitly out of scope for this slice

- Dynamic/runtime network membership (Corda doorman, X.509 CA, live
  node-join without redeploy).
- Any change to `api` or `web` — this remains a standalone,
  directly-testable CorDapp/`blockchain-layer` capability.
- N-banks-per-trade (syndicated deals, multiple advising banks on one
  trade) — each trade still has exactly one issuing and one advising bank.
- Changes to `ledger-monitoring` — its contract is deliberately untouched
  (see below).

## Architecture

The Corda network grows from 4 parties (Importer, Exporter, IssuingBank,
AdvisingBank) + 1 notary to 4 parties + **2 additional banks** (`Bank3`,
`Bank4`) + 1 notary — 4 banks total in the pool. Sized to stay within a
reasonable Docker Compose footprint (8 containers total, up from 6) while
genuinely proving "any bank pair works," not just growing a count. Each new
bank is a `node{}` block in `CorDapp/build.gradle`'s `deployNodes`, mirroring
the existing bank blocks exactly: RPC settings bound to `0.0.0.0`, an
explicit `p2pAddress` matching its Docker Compose service name, and
`cordapp project(':contracts')`/`(':workflows')`. A matching Docker Compose
service is added per new bank.

`IssueLCFlow.Initiator` already accepts `issuingBank: Party` and
`advisingBank: Party` as constructor parameters, and `blockchain-layer`'s
`resolveParty()` already resolves any party by name generically via
`ops.networkMapSnapshot()` — so `issue-lc` needs **no CorDapp contract or
workflow changes** to support additional banks. The real gap is entirely in
`blockchain-layer`'s `RpcConnections`, which hardcodes exactly one RPC
connection per fixed role (`importer`/`exporter`/`issuingBank`/
`advisingBank`). Any of the 4 banks can now be a trade's issuing or
advising bank, so `blockchain-layer` needs an RPC connection to *every*
bank in the pool, keyed by name — not just the original two.

## Components & Data Flow

**`RpcConnections`** changes from 4 fixed named constructor parameters to:
`importerConfig`, `exporterConfig` unchanged (still exactly one of each —
importer/exporter are not part of the growing bank pool), plus a
`bankConfigs: Map<String, PartyRpcConfig>` keyed by bank name (`"IssuingBank"`,
`"AdvisingBank"`, `"Bank3"`, `"Bank4"`), each built from environment
variables following the existing `config(prefix, defaultPort, defaultUser,
defaultPassword)` pattern (e.g. `BANK3_RPC_HOST`, `BANK3_RPC_PORT`, ...).
The bank list itself is driven by a `BANK_NAMES` environment variable
(comma-separated), so the pool size is config-driven, not a code change. A
`banks: Map<String, CordaRPCOps>` property replaces the fixed
`issuingBank`/`advisingBank` accessors.

**Request DTOs** (`CorDapp/blockchain-layer/.../dto/FlowDtos.kt`):
- `AcceptDocsRequest(linearId: String, issuingBank: String? = null)`
- `SettlePaymentRequest(linearId, documentId, documentType, onChainHash, issuingBank: String? = null)`

The new field is **optional**, defaulting to `"IssuingBank"` (the original
node) when omitted. This matters because `SettlePaymentRequest` currently
has the exact same 4 fields `ledger-monitoring`'s `payment-confirmed`
endpoint mirrors verbatim — making `issuingBank` required would force a
matching change there, breaking this slice's CorDapp-only scope. With an
optional field defaulting to the original pair, `ledger-monitoring` needs
zero changes; only a caller exercising a non-default bank pair (e.g. this
slice's own integration test) needs to pass it explicitly.

**`RealCordaGateway.acceptDocs`/`settlePayment`** resolve the RPC
connection via `connections.banks[issuingBank ?: "IssuingBank"]`. An
unknown bank name (outside the configured pool) throws
`IllegalArgumentException("Unknown bank: <name>")`, reusing the existing
`IllegalArgumentException` → 400 handler already in `Application.kt` — no
new error-handling code needed.

**`issue-lc`** requires no changes beyond already working — `issuingBank`/
`advisingBank` in `IssueLCRequest` can now legitimately name any of the 4
banks, resolved generically via the existing `resolveParty()`.

**Unaffected:**
- `ship-goods`, `regulatory-clear`, `regulatory-close` — initiated by the
  single fixed `exporter`/`importer` connections; the advising/issuing bank
  is only ever resolved as a `Party` for signing there, never needs its own
  RPC connection.
- `get-trade`/`list-trades` — vault queries via the fixed `importer`
  connection, who is a participant in every trade regardless of bank pair.
- `ledger-monitoring` — zero changes; the new field is optional and
  defaults to the original pair.

## Error Handling

No new error categories. The one new failure mode — a caller naming a bank
outside the configured pool — reuses the existing `IllegalArgumentException`
→ 400 path already present in `Application.kt`'s `StatusPages` (added
during `blockchain-layer`'s own final review this session). All other error
handling (`FlowRejectedException` → 400, `CordaConnectionException` → 502,
catch-all → 500) is untouched.

## Testing

The concrete proof this works: extend `blockchain-layer`'s existing live-Docker
integration test (`FullLifecycleIT.kt`, already proven against the original
2-bank pair) to run **two independent full trade lifecycles concurrently
against the same expanded network** — Trade A using the original
`IssuingBank`/`AdvisingBank` pair via the default/omitted `issuingBank`
field (proving backward compatibility), Trade B using `Bank3`/`Bank4`
explicitly. Both must independently reach `SETTLED`, proving the
RPC-connection-map routing genuinely works for a non-default bank pair, not
just that the config parses.

Unit-level: a new test for `RealCordaGateway.acceptDocs`/`settlePayment`
asserting the correct RPC connection is selected from the map for a given
`issuingBank` name, and that an unknown bank name produces the 400
`IllegalArgumentException` path — using the same mocked-`CordaRPCOps` style
already established in `RealCordaGateway`'s existing unit tests.

No `ledger-monitoring` test changes needed (its contract is untouched).
