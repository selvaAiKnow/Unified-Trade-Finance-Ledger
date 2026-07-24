# UTFL Trade Finance CorDapp

A Corda 4.10 / Kotlin CorDapp implementing the letter-of-credit milestone
lifecycle described in
`docs/superpowers/specs/2026-07-21-corda-trade-finance-cordapp-design.md`.

This is the blockchain layer only: `TradeFinanceState`, `TradeFinanceContract`,
and six milestone flows (`IssueLCFlow`, `RegulatoryClearFlow`, `ShipGoodsFlow`,
`AcceptDocsFlow`, `SettlePaymentFlow`, `RegulatoryCloseFlow`). It does not include
a portal, orchestration service, compliance/risk services, or any real node
deployment — see the spec for what's deliberately out of scope.

## Requirements

- JDK 8 (Corda 4.x does not run on JDK 11+)
- Internet access on first build (downloads Gradle 5.6.4 and Corda 4.10 artifacts)

## Build and test

```bash
./gradlew build   # compiles both modules
./gradlew test    # runs all contract and flow tests
```

## Module layout

- `contracts/` — `TradeFinanceState`, `TradeFinanceContract`, and the milestone/
  compliance enums. No flow logic.
- `workflows/` — one `Initiator`/`Responder` flow pair per milestone, plus shared
  `FlowSupport.kt` (vault lookup helper + the generic observer-aware responder).

## Milestone lifecycle

`LC_ISSUED → REGULATORY_CLEARED → SHIPPED → ACCEPTED → SETTLED → CLOSED`

See the spec for the full signer table and anchoring-category mapping per
milestone.
