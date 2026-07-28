# blockchain-layer

A Kotlin/Ktor bridge service exposing the UTFL trade-finance CorDapp's flows as a REST API
for two instruments: Letter of Credit (6 milestone flows) and Bank Guarantee, backed by a
real, Docker-deployed 6-party + notary Corda network (including a 4-bank pool:
`IssuingBank`, `AdvisingBank`, `Bank3`, `Bank4`) -- not `MockNetwork`. See
`docs/superpowers/specs/2026-07-27-blockchain-layer-design.md` and
`docs/superpowers/specs/2026-07-28-multi-bank-onboarding-design.md` for the design.

This is a standalone service in this phase: nothing in `api` or `web` calls it yet.
It's exercised directly via its own REST API and integration tests.

## Requirements

- JDK 8 (to run the Corda nodes) **and** JDK 17 (to run `blockchain-layer` itself)
  both installed — they're separate JVM processes. `CorDapp/`'s own Gradle build
  (`publishToMavenLocal`, `deployNodes`) needs `JAVA_HOME` pointed at JDK 8;
  `blockchain-layer/`'s build needs JDK 17 (it's pinned via a Gradle toolchain, so
  `./gradlew` there will provision/select JDK 17 on its own as long as JDK 8 isn't
  forced onto it via `JAVA_HOME`).
- Docker + Docker Compose, with the Docker daemon (Docker Desktop, on Windows/Mac)
  actually running before any `docker compose` command.
- The `contracts` and `workflows` modules published to Maven local (see below).

## One-time setup: publish contracts/workflows and generate the node network

From `CorDapp/` (JDK 8 — set `JAVA_HOME` to a JDK 8 install if your default is
newer):

```bash
./gradlew :contracts:publishToMavenLocal :workflows:publishToMavenLocal
./gradlew deployNodes
```

`deployNodes` generates the 7 node directories (`build/nodes/{Notary,Importer,
Exporter,IssuingBank,AdvisingBank,Bank3,Bank4}`) that `CorDapp/docker/docker-compose.yml`
builds its images from -- rerun it whenever `contracts`/`workflows` change.

## Run the full stack

The `blockchain-layer` Docker image doesn't compile Kotlin itself — it just
copies a prebuilt shadow jar — so build that first:

```bash
cd CorDapp/blockchain-layer
./gradlew shadowJar
```

Then bring up all 8 containers (notary, 6 party nodes, `blockchain-layer`):

```bash
cd CorDapp/docker
docker compose up -d --build
```

Corda's RPC listeners take roughly 35-60s to come up after their containers
start. `blockchain-layer` connects to all 6 nodes' RPC eagerly on startup and
exits if any connection fails, so it's expected to crash-loop a few times right
after `up` (`restart: on-failure` in `docker-compose.yml` retries it with
backoff) until a connection attempt lands after every node is ready. Poll
`/health` rather than assuming the first `curl` will succeed:

```bash
until curl -sf http://localhost:8081/health; do sleep 5; done
```

## Example: drive one trade through the full lifecycle

```bash
curl -X POST http://localhost:8081/flows/issue-lc \
  -H 'Content-Type: application/json' \
  -d '{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-2026-0001","lcTermsDocumentId":"DOC-1","lcTermsHash":"<64-hex-char-sha256>"}'
# => {"linearId":"...","txId":"...","status":"LC_ISSUED"}

curl http://localhost:8081/trades/<linearId>
```

Each of the other 5 milestones (`/flows/regulatory-clear`, `/flows/ship-goods`,
`/flows/accept-docs`, `/flows/settle-payment`, `/flows/regulatory-close`) follows
the same shape — see
`src/main/kotlin/com/utfl/blockchainlayer/dto/FlowDtos.kt` for every endpoint's
exact request body, and `src/integrationTest/kotlin/com/utfl/blockchainlayer/FullLifecycleIT.kt`
for a full worked example of all 6 calls in sequence plus the read endpoints
(`GET /trades/{linearId}`, `GET /trades`).

Errors come back as `{"error": "<message>"}` with a status code depending on
the cause: `404` (unknown trade), `400` (flow rejected by the CorDapp, e.g.
failed contract validation), or `502` (Corda RPC connection failure).

## Bank pool

The network hosts 4 banks: `IssuingBank`, `AdvisingBank`, `Bank3`, `Bank4`.
Any two distinct banks can be named as `issuingBank`/`advisingBank` in
`/flows/issue-lc` -- they don't have to be the original pair. The bank
pool itself is config-driven (`BANK_NAMES` env var on `blockchain-layer`,
plus a matching Corda node and Docker Compose service per bank) -- adding a
5th bank means adding a `node{}` block, a Docker Compose service, and a
`BANK_NAMES` entry, then redeploying.

`/flows/accept-docs` and `/flows/settle-payment` take an optional
`issuingBank` field identifying which bank's RPC connection to route
through -- it defaults to `"IssuingBank"` when omitted, so existing callers
(like `ledger-monitoring`, which never sends this field) keep working
against the original pair unchanged. A trade issued with a different
issuing bank must pass that bank's name explicitly in these two calls, or
the request fails (the flow would be initiated from a node that isn't
actually a participant in that trade). Naming a bank outside the
configured pool returns `400 {"error": "Unknown bank: <name>"}`. Naming a
bank that IS in the configured pool but wasn't this trade's actual issuing
bank -- including simply omitting the field for a trade issued by `Bank3`
or `Bank4` -- also returns a clean `400 {"error": "Trade <linearId> was not
issued by <bankName>"}` rather than an opaque `500`, since that node was
never a participant in the trade and has no such state in its vault.

`/flows/issue-lc` validates `issuingBank` against blockchain-layer's own
RPC-connected bank pool (not just the Corda network map), so issuing a
trade to a bank added to the Corda network but not yet added to
`BANK_NAMES` fails fast with `400 {"error": "Unknown bank: <name>"}`
instead of creating a trade that can never be advanced afterward.

## Bank Guarantee (a second instrument)

Alongside the Letter of Credit lifecycle, `blockchain-layer` also exposes
a second, independent instrument: Bank Guarantee. It's backed by its own
Corda state/contract (`GuaranteeState`/`GuaranteeContract`) — completely
separate from `TradeFinanceState`/`TradeFinanceContract` — proving the
platform can hold more than one trade-finance product. See
`docs/superpowers/specs/2026-07-28-bank-guarantee-design.md` for the
design.

It reuses the same 4 Corda parties in new roles: `Importer`→applicant,
`Exporter`→beneficiary, `IssuingBank`→guarantor bank, `AdvisingBank`→
advising bank. The lifecycle is a single linear happy path:

```
POST /flows/issue-guarantee   -> ISSUED
POST /flows/invoke-claim      -> CLAIM_INVOKED
POST /flows/pay-claim         -> CLAIM_PAID
POST /flows/close-guarantee   -> CLOSED
```

Plus `GET /guarantees/{linearId}` and `GET /guarantees` to read state back.
See `src/main/kotlin/com/utfl/blockchainlayer/dto/GuaranteeDtos.kt` for
every endpoint's exact request body, and
`src/integrationTest/kotlin/com/utfl/blockchainlayer/GuaranteeLifecycleIT.kt`
for a full worked example of all 4 calls in sequence plus the read
endpoints.

`/flows/pay-claim` takes the same optional `guarantorBank` field as
`/flows/accept-docs`/`/flows/settle-payment` (defaulting to `"IssuingBank"`
when omitted), reusing the exact bank-pool routing built for multi-bank
onboarding — any of the 4 pool banks can be a guarantee's guarantor bank,
not just the original one.

## Build and test

```bash
cd CorDapp/blockchain-layer
./gradlew test              # fast, no Docker needed (uses FakeCordaGateway)
./scripts/run-integration-tests.sh   # starts Docker Compose, runs the real lifecycle, tears down
```

`run-integration-tests.sh` builds and starts the full Docker Compose network,
polls `/health` until `blockchain-layer` is actually serving (not just its
container running), runs the real end-to-end lifecycle tests against it
(`FullLifecycleIT` for the LC instrument, `GuaranteeLifecycleIT` for the
guarantee instrument), tears the network down, and propagates the exit
code -- this is the same check that proves the whole system works end to
end, not just each piece in isolation.

## Module layout

- `corda/` — `CordaGateway` interface, `RealCordaGateway` (RPC-backed), the
  importer/exporter RPC connections plus the config-driven bank connection map
  (`RpcConnections`), Corda-specific exceptions (`CordaExceptions.kt`).
- `routes/` — Ktor route handlers, one file per concern (`FlowRoutes.kt` for flows
  of both instruments: 6 LC milestones and 4 Bank Guarantee flows, `TradeRoutes.kt` for
  read endpoints of both instruments: LC and guarantee reads).
- `dto/` — `@Serializable` request/response bodies (`FlowDtos.kt`,
  `ErrorResponse.kt`).

## Not in scope for this service (see the design spec)

- Wiring `api`/`web` to call this service.
- Dynamic org-to-Corda-party mapping.
- Authentication between services.
- Async/queued flow invocation.
