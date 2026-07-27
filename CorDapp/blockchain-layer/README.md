# blockchain-layer

A Kotlin/Ktor bridge service exposing the UTFL trade-finance CorDapp's 6 milestone
flows as a REST API, backed by a real, Docker-deployed 4-party + notary Corda
network — not `MockNetwork`. See
`docs/superpowers/specs/2026-07-27-blockchain-layer-design.md` for the design.

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

`deployNodes` generates the 5 node directories (`build/nodes/{Notary,Importer,
Exporter,IssuingBank,AdvisingBank}`) that `CorDapp/docker/docker-compose.yml`
builds its images from — rerun it whenever `contracts`/`workflows` change.

## Run the full stack

The `blockchain-layer` Docker image doesn't compile Kotlin itself — it just
copies a prebuilt shadow jar — so build that first:

```bash
cd CorDapp/blockchain-layer
./gradlew shadowJar
```

Then bring up all 6 containers (notary, 4 party nodes, `blockchain-layer`):

```bash
cd CorDapp/docker
docker compose up -d --build
```

Corda's RPC listeners take roughly 35-60s to come up after their containers
start. `blockchain-layer` connects to all 4 nodes' RPC eagerly on startup and
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

## Build and test

```bash
cd CorDapp/blockchain-layer
./gradlew test              # fast, no Docker needed (uses FakeCordaGateway)
./scripts/run-integration-tests.sh   # starts Docker Compose, runs the real lifecycle, tears down
```

`run-integration-tests.sh` builds and starts the full Docker Compose network,
polls `/health` until `blockchain-layer` is actually serving (not just its
container running), runs the real end-to-end lifecycle test against it, tears
the network down, and propagates the test's exit code — this is the same check
that proves the whole system works end to end, not just each piece in
isolation.

## Module layout

- `corda/` — `CordaGateway` interface, `RealCordaGateway` (RPC-backed), the 4
  fixed RPC connections (`RpcConnections`), Corda-specific exceptions
  (`CordaExceptions.kt`).
- `routes/` — Ktor route handlers, one file per concern (`FlowRoutes.kt` for the 6
  milestone endpoints, `TradeRoutes.kt` for the 2 read endpoints).
- `dto/` — `@Serializable` request/response bodies (`FlowDtos.kt`,
  `ErrorResponse.kt`).

## Not in scope for this service (see the design spec)

- Wiring `api`/`web` to call this service.
- Dynamic org-to-Corda-party mapping.
- Authentication between services.
- Async/queued flow invocation.
