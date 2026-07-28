# Multi-Bank Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the Corda network from a fixed 2-bank pair (IssuingBank,
AdvisingBank) to a configurable 4-bank pool (adding Bank3, Bank4), and teach
`blockchain-layer` to route `accept-docs`/`settle-payment` to whichever bank
actually issued a given trade's LC — proving any two banks in the pool can
complete a full trade lifecycle, not just the original pair.

**Architecture:** Two new Corda party nodes (Bank3, Bank4) join the existing
network via `CorDapp/build.gradle`'s `deployNodes` and a matching Docker
Compose service each — no CorDapp contract/workflow changes, since
`IssueLCFlow` and `resolveParty()` already resolve any named party
generically. `blockchain-layer`'s `RpcConnections` changes from 4 fixed
named RPC connections to a bank-name-keyed map (`Map<String, CordaRPCOps>`),
and `accept-docs`/`settle-payment` gain an optional `issuingBank` request
field (defaulting to `"IssuingBank"` when omitted) used to select the right
connection from that map.

**Tech Stack:** Kotlin 1.2.71 (CorDapp `contracts`/`workflows`, unchanged),
Corda 4.10 Cordformation (`deployNodes`), Docker Compose, Kotlin 1.9.24/Ktor
2.3.12/JDK 17 (`blockchain-layer`, unchanged tooling).

## Global Constraints

- **Onboarding model:** configurable node set, redeploy to add. No dynamic
  runtime network-join infrastructure (Corda doorman/CA) in this slice.
- **Bank pool:** exactly 4 banks total — `IssuingBank`, `AdvisingBank`
  (existing, unchanged names/ports) plus `Bank3`, `Bank4` (new). Each trade
  still has exactly two bank roles (issuing, advising) — no
  N-banks-per-trade redesign.
- **Scope:** CorDapp/`blockchain-layer` only. No changes to `api`, `web`,
  or `ledger-monitoring`.
- **Bank selection:** the caller specifies both banks by name per trade
  (already how `issue-lc` works). `accept-docs`/`settle-payment` gain an
  **optional** `issuingBank: String? = null` field, defaulting to
  `"IssuingBank"` when omitted, so `ledger-monitoring`'s existing calls
  (which never send this field) keep working unchanged.
- **Error handling:** a caller naming a bank outside the configured pool
  throws `IllegalArgumentException("Unknown bank: <name>")`, reusing the
  existing `IllegalArgumentException` → 400 handler already in
  `Application.kt`. No new error-handling code.

---

### Task 1: Add Bank3 and Bank4 nodes to the Corda network

**Files:**
- Modify: `CorDapp/build.gradle`

**Interfaces:**
- Consumes: nothing new.
- Produces: two new node directories under `CorDapp/build/nodes/` after
  `deployNodes` runs (`Bank3`, `Bank4`), each with RPC listening on
  `0.0.0.0:10014`/`0.0.0.0:10016` respectively — consumed by Task 2's
  Docker Compose services and Task 3's `blockchain-layer` RPC config.

- [ ] **Step 1: Add the Bank3 and Bank4 `node{}` blocks**

In `CorDapp/build.gradle`, inside the `deployNodes` task, immediately after
the existing `AdvisingBank` node block (the last one, ending at line 161),
add two more node blocks, mirroring the existing bank blocks exactly:

```groovy
    node {
        name "O=Bank3,L=Singapore,C=SG"
        p2pPort 10013
        p2pAddress "corda-bank3:10013"
        rpcSettings {
            address "0.0.0.0:10014"
            adminAddress "0.0.0.0:10054"
        }
        rpcUsers = [[user: "bank3Rpc", password: "bank3pass", permissions: ["ALL"]]]
        projectCordapp {
            deploy = false
        }
        cordapp project(':contracts')
        cordapp project(':workflows')
    }

    node {
        name "O=Bank4,L=Frankfurt,C=DE"
        p2pPort 10015
        p2pAddress "corda-bank4:10015"
        rpcSettings {
            address "0.0.0.0:10016"
            adminAddress "0.0.0.0:10056"
        }
        rpcUsers = [[user: "bank4Rpc", password: "bank4pass", permissions: ["ALL"]]]
        projectCordapp {
            deploy = false
        }
        cordapp project(':contracts')
        cordapp project(':workflows')
    }
```

- [ ] **Step 2: Regenerate the node network and verify Bank3/Bank4 appear**

From `CorDapp/` (JDK 8 — set `JAVA_HOME` to a JDK 8 install if the default
is newer):

```bash
./gradlew :contracts:publishToMavenLocal :workflows:publishToMavenLocal
./gradlew deployNodes
```

Run: `ls build/nodes` (or `dir build\nodes` on Windows)
Expected: 7 directories — `Notary`, `Importer`, `Exporter`, `IssuingBank`,
`AdvisingBank`, `Bank3`, `Bank4` (up from 5).

- [ ] **Step 3: Commit**

```bash
git add CorDapp/build.gradle
git commit -m "Add Bank3 and Bank4 nodes to the Corda network"
```

---

### Task 2: Docker Compose — add Bank3/Bank4 services and blockchain-layer env vars

**Files:**
- Modify: `CorDapp/docker/docker-compose.yml`

**Interfaces:**
- Consumes: `CorDapp/build/nodes/Bank3`, `CorDapp/build/nodes/Bank4`
  (produced by Task 1's `deployNodes`).
- Produces: Docker Compose services `bank3-node`/`bank4-node` reachable at
  hostnames `bank3-node:10014`/`bank4-node:10016` inside the
  `corda-network` bridge — consumed by Task 3's `blockchain-layer` RPC
  config (`BANK3_RPC_HOST`/`BANK4_RPC_HOST` env vars).

- [ ] **Step 1: Add the `bank3-node` and `bank4-node` services**

In `CorDapp/docker/docker-compose.yml`, immediately after the
`advisingbank-node` service block (ending at line 57, right before the
`blockchain-layer` service), add:

```yaml
  bank3-node:
    build:
      context: ../build/nodes/Bank3
      dockerfile: ../../../docker/Dockerfile.corda-node
    container_name: corda-bank3
    ports:
      - "10014:10014"
    networks:
      - corda-network
    depends_on:
      - notary

  bank4-node:
    build:
      context: ../build/nodes/Bank4
      dockerfile: ../../../docker/Dockerfile.corda-node
    container_name: corda-bank4
    ports:
      - "10016:10016"
    networks:
      - corda-network
    depends_on:
      - notary
```

- [ ] **Step 2: Wire `blockchain-layer` to reach the two new nodes**

In the same file, update the `blockchain-layer` service's `environment` and
`depends_on` blocks:

```yaml
  blockchain-layer:
    build:
      context: ../blockchain-layer
      dockerfile: Dockerfile
    container_name: blockchain-layer
    ports:
      - "8081:8081"
    environment:
      IMPORTER_RPC_HOST: importer-node
      EXPORTER_RPC_HOST: exporter-node
      ISSUING_BANK_RPC_HOST: issuingbank-node
      ADVISING_BANK_RPC_HOST: advisingbank-node
      BANK3_RPC_HOST: bank3-node
      BANK4_RPC_HOST: bank4-node
      BANK_NAMES: "IssuingBank,AdvisingBank,Bank3,Bank4"
    networks:
      - corda-network
    depends_on:
      - importer-node
      - exporter-node
      - issuingbank-node
      - advisingbank-node
      - bank3-node
      - bank4-node
    # The Corda nodes take ~35s to finish registering and open their RPC
    # ports after their containers start; `depends_on` (without a
    # healthcheck-based condition) only waits for the containers to start,
    # not for RPC to be ready. RpcConnections connects eagerly on startup
    # and exits on failure, so blockchain-layer will crash on its first
    # few attempts before the nodes are ready -- `on-failure` lets Docker
    # restart it (with backoff) until a connection attempt lands after all
    # 6 nodes' RPC endpoints are up.
    restart: on-failure
```

(Only the `environment` and `depends_on` blocks changed; the rest of the
service definition is unchanged — shown in full here so the whole block is
easy to paste over.)

- [ ] **Step 3: Verify the compose file parses correctly**

Run: `cd CorDapp/docker && docker compose config --quiet`
Expected: no output, exit code 0 (Compose's `config` command validates and
resolves the file without starting anything).

- [ ] **Step 4: Commit**

```bash
git add CorDapp/docker/docker-compose.yml
git commit -m "Add bank3-node and bank4-node Docker Compose services"
```

---

### Task 3: Generalize RpcConnections to a bank-name-keyed map

**Files:**
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RpcConnections.kt`

**Interfaces:**
- Consumes: nothing new (same `PartyRpcConfig`/env-var-driven config
  pattern already in this file).
- Produces: `RpcConnections.banks: Map<String, CordaRPCOps>` (replaces the
  removed `issuingBank`/`advisingBank` accessor properties) — consumed by
  Task 4's `resolveBank` helper in `RealCordaGateway`.

This task has no automated test of its own (constructing a real
`RpcConnections` requires a live Corda RPC connection to each configured
bank — the same reason `RunRpcTest.kt` tests `runRpc` as a standalone
function rather than testing `RealCordaGateway` directly). Its correctness
is proven by Task 4's unit tests (which exercise the bank-lookup logic in
isolation) and Task 5's live integration test (which proves the real
connections actually work end to end).

- [ ] **Step 1: Replace the file's contents**

Replace the full contents of `RpcConnections.kt` with:

```kotlin
package com.utfl.blockchainlayer.corda

import net.corda.client.rpc.CordaRPCClient
import net.corda.client.rpc.CordaRPCConnection
import net.corda.core.messaging.CordaRPCOps
import net.corda.core.utilities.NetworkHostAndPort

data class PartyRpcConfig(
    val host: String,
    val port: Int,
    val username: String,
    val password: String
)

class RpcConnections(
    importerConfig: PartyRpcConfig,
    exporterConfig: PartyRpcConfig,
    bankConfigs: Map<String, PartyRpcConfig>
) : AutoCloseable {
    private val importerConnection = connect(importerConfig)
    private val exporterConnection = connect(exporterConfig)
    private val bankConnections: Map<String, CordaRPCConnection> =
        bankConfigs.mapValues { (_, config) -> connect(config) }

    val importer: CordaRPCOps get() = importerConnection.proxy
    val exporter: CordaRPCOps get() = exporterConnection.proxy
    val banks: Map<String, CordaRPCOps> get() = bankConnections.mapValues { (_, conn) -> conn.proxy }

    private fun connect(config: PartyRpcConfig): CordaRPCConnection {
        return try {
            CordaRPCClient(NetworkHostAndPort(config.host, config.port))
                .start(config.username, config.password)
        } catch (e: Exception) {
            throw CordaConnectionException("Could not connect to Corda RPC at ${config.host}:${config.port}", e)
        }
    }

    override fun close() {
        importerConnection.notifyServerAndClose()
        exporterConnection.notifyServerAndClose()
        bankConnections.values.forEach { it.notifyServerAndClose() }
    }
}

private data class BankRpcDefaults(
    val envPrefix: String,
    val port: Int,
    val user: String,
    val password: String
)

private val knownBankDefaults: Map<String, BankRpcDefaults> = mapOf(
    "IssuingBank" to BankRpcDefaults("ISSUING_BANK", 10010, "issuingBankRpc", "issuingbankpass"),
    "AdvisingBank" to BankRpcDefaults("ADVISING_BANK", 10012, "advisingBankRpc", "advisingbankpass"),
    "Bank3" to BankRpcDefaults("BANK3", 10014, "bank3Rpc", "bank3pass"),
    "Bank4" to BankRpcDefaults("BANK4", 10016, "bank4Rpc", "bank4pass")
)

object RpcConfigLoader {
    fun fromEnv(): RpcConnections {
        fun config(prefix: String, defaultPort: Int, defaultUser: String, defaultPassword: String) = PartyRpcConfig(
            host = System.getenv("${prefix}_RPC_HOST") ?: "localhost",
            port = (System.getenv("${prefix}_RPC_PORT") ?: defaultPort.toString()).toInt(),
            username = System.getenv("${prefix}_RPC_USER") ?: defaultUser,
            password = System.getenv("${prefix}_RPC_PASSWORD") ?: defaultPassword
        )

        val bankNames = (System.getenv("BANK_NAMES") ?: knownBankDefaults.keys.joinToString(","))
            .split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }

        val bankConfigs = bankNames.associateWith { name ->
            val defaults = knownBankDefaults[name]
                ?: error("Unknown bank '$name' in BANK_NAMES -- no default RPC config registered for it in RpcConnections.kt")
            config(defaults.envPrefix, defaults.port, defaults.user, defaults.password)
        }

        return RpcConnections(
            importerConfig = config("IMPORTER", 10006, "importerRpc", "importerpass"),
            exporterConfig = config("EXPORTER", 10008, "exporterRpc", "exporterpass"),
            bankConfigs = bankConfigs
        )
    }
}
```

This removes the old fixed `issuingBankConfig`/`advisingBankConfig`
constructor parameters and the `issuingBank`/`advisingBank` accessor
properties entirely, replacing them with the `bankConfigs`/`banks` map.
`RealCordaGateway.kt` (Task 4) is the only other file that referenced the
removed accessors — this will not compile again until Task 4 updates it;
that's expected and resolved within the same fix-loop if a build is
attempted before Task 4 runs.

- [ ] **Step 2: Commit**

```bash
git add CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RpcConnections.kt
git commit -m "Generalize RpcConnections to a bank-name-keyed connection map"
```

---

### Task 4: Route accept-docs/settle-payment to the correct bank's RPC connection

**Files:**
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/CordaGateway.kt`
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RealCordaGateway.kt`
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/dto/FlowDtos.kt`
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/routes/FlowRoutes.kt`
- Modify: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/corda/FakeCordaGateway.kt`
- Modify: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/routes/FlowRoutesTest.kt`
- Test: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/corda/ResolveBankTest.kt` (new)

**Interfaces:**
- Consumes: `RpcConnections.banks: Map<String, CordaRPCOps>` (Task 3).
- Produces: `CordaGateway.acceptDocs(linearId, issuingBank: String? = null)`
  and `CordaGateway.settlePayment(..., issuingBank: String? = null)` — the
  public contract Task 5's integration test drives directly over HTTP via
  `AcceptDocsRequest`/`SettlePaymentRequest`'s new `issuingBank` field.

This task touches the interface, its one real implementation, its one test
fake, and the route that wires them together — all four must change
together (Kotlin's compiler enforces the interface/implementations/fake
stay in lockstep), so they're one task rather than split further.

- [ ] **Step 1: Write the failing unit test for the bank-lookup helper**

Create `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/corda/ResolveBankTest.kt`:

```kotlin
package com.utfl.blockchainlayer.corda

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * Unit tests for RealCordaGateway.kt's bank-routing helper `resolveBank`.
 *
 * Generic over the map's value type so this can be tested with plain
 * Strings instead of real `CordaRPCOps` instances -- constructing a real
 * one requires a live Corda RPC connection, which this test deliberately
 * avoids (same reasoning as RunRpcTest.kt for `runRpc`).
 */
class ResolveBankTest {
    private val banks = mapOf(
        "IssuingBank" to "issuing-bank-connection",
        "AdvisingBank" to "advising-bank-connection",
        "Bank3" to "bank3-connection",
        "Bank4" to "bank4-connection"
    )

    @Test
    fun `an explicitly named bank resolves to its connection`() {
        assertEquals("bank3-connection", resolveBank(banks, "Bank3"))
    }

    @Test
    fun `a null bank name defaults to IssuingBank's connection`() {
        assertEquals("issuing-bank-connection", resolveBank(banks, null))
    }

    @Test
    fun `an unknown bank name throws IllegalArgumentException`() {
        val ex = assertFailsWith<IllegalArgumentException> {
            resolveBank(banks, "Bank99")
        }
        assertEquals("Unknown bank: Bank99", ex.message)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd CorDapp/blockchain-layer && ./gradlew test --tests "*.ResolveBankTest"`
Expected: FAIL to compile — `resolveBank` is not defined yet.

- [ ] **Step 3: Add `resolveBank` and update `RealCordaGateway`**

In `RealCordaGateway.kt`, change the `acceptDocs` and `settlePayment`
overrides:

```kotlin
    override fun acceptDocs(linearId: String, issuingBank: String?): FlowResult {
        val ops = resolveBank(connections.banks, issuingBank)
        val stx = runRpc {
            ops.startFlowDynamic(
                AcceptDocsFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun settlePayment(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String,
        issuingBank: String?
    ): FlowResult {
        val ops = resolveBank(connections.banks, issuingBank)
        val stx = runRpc {
            ops.startFlowDynamic(
                SettlePaymentFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }
```

(Both differ from the current code only in resolving `ops` via
`resolveBank(connections.banks, issuingBank)` instead of
`connections.issuingBank`, and in accepting the new `issuingBank`
parameter.)

Add `resolveBank` as a top-level function at the bottom of the file,
alongside `runRpc` (same "kept as a top-level function so it's unit
testable without a live connection" reasoning):

```kotlin
internal fun <T> resolveBank(banks: Map<String, T>, requestedBank: String?): T {
    val name = requestedBank ?: "IssuingBank"
    return banks[name] ?: throw IllegalArgumentException("Unknown bank: $name")
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd CorDapp/blockchain-layer && ./gradlew test --tests "*.ResolveBankTest"`
Expected: PASS (3 tests)

- [ ] **Step 5: Update the interface, DTOs, fake, and routes**

In `CordaGateway.kt`, change the two method signatures:

```kotlin
    fun acceptDocs(linearId: String, issuingBank: String? = null): FlowResult

    fun settlePayment(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String,
        issuingBank: String? = null
    ): FlowResult
```

In `FlowDtos.kt`, change the two request DTOs:

```kotlin
@Serializable
data class AcceptDocsRequest(val linearId: String, val issuingBank: String? = null)

@Serializable
data class SettlePaymentRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String,
    val issuingBank: String? = null
)
```

In `FlowRoutes.kt`, forward the new field:

```kotlin
    post("/flows/accept-docs") {
        val body = call.receive<AcceptDocsRequest>()
        val result = gateway.acceptDocs(linearId = body.linearId, issuingBank = body.issuingBank)
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/settle-payment") {
        val body = call.receive<SettlePaymentRequest>()
        val result = gateway.settlePayment(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash,
            issuingBank = body.issuingBank
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }
```

In `FakeCordaGateway.kt`, change the two overrides to capture the new
argument:

```kotlin
    override fun acceptDocs(linearId: String, issuingBank: String?): FlowResult {
        lastAcceptDocsArgs = listOf(linearId, issuingBank)
        acceptDocsError?.let { throw it }
        return acceptDocsResult ?: error("acceptDocsResult not configured")
    }

    override fun settlePayment(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String,
        issuingBank: String?
    ): FlowResult {
        lastSettlePaymentArgs = listOf(linearId, documentId, documentType, onChainHash, issuingBank)
        settlePaymentError?.let { throw it }
        return settlePaymentResult ?: error("settlePaymentResult not configured")
    }
```

- [ ] **Step 6: Update the two existing FlowRoutesTest assertions**

`FakeCordaGateway` now always records `issuingBank` as the last element of
`lastAcceptDocsArgs`/`lastSettlePaymentArgs`, even when the caller omitted
it (`null`). Update the two existing tests in `FlowRoutesTest.kt` whose
assertions predate this field:

```kotlin
        assertEquals(listOf("abc-123", null), gateway.lastAcceptDocsArgs)
```

(in `POST flows accept-docs calls the gateway and returns the flow result`,
replacing `assertEquals(listOf("abc-123"), gateway.lastAcceptDocsArgs)`)

```kotlin
        assertEquals(listOf("abc-123", "DOC-5", "MT202", "9ABC", null), gateway.lastSettlePaymentArgs)
```

(in `POST flows settle-payment calls the gateway and returns the flow
result`, replacing
`assertEquals(listOf("abc-123", "DOC-5", "MT202", "9ABC"), gateway.lastSettlePaymentArgs)`)

- [ ] **Step 7: Add new FlowRoutesTest cases proving the field is forwarded**

Add to `FlowRoutesTest.kt`:

```kotlin
    @Test
    fun `POST flows accept-docs forwards an explicit issuingBank to the gateway`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.acceptDocsResult = FlowResult(linearId = "abc-123", txId = "tx-4", status = "ACCEPTED")
        application { module(gateway) }

        val response = client.post("/flows/accept-docs") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"abc-123","issuingBank":"Bank3"}""")
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(listOf("abc-123", "Bank3"), gateway.lastAcceptDocsArgs)
    }

    @Test
    fun `POST flows settle-payment forwards an explicit issuingBank to the gateway`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.settlePaymentResult = FlowResult(linearId = "abc-123", txId = "tx-5", status = "SETTLED")
        application { module(gateway) }

        val response = client.post("/flows/settle-payment") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","documentId":"DOC-5","documentType":"MT202","onChainHash":"9ABC","issuingBank":"Bank4"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(listOf("abc-123", "DOC-5", "MT202", "9ABC", "Bank4"), gateway.lastSettlePaymentArgs)
    }
```

- [ ] **Step 8: Run the full unit test suite to verify everything passes**

Run: `cd CorDapp/blockchain-layer && ./gradlew test`
Expected: PASS, all tests green (existing suite plus the 3 new
`ResolveBankTest` cases and 2 new `FlowRoutesTest` cases).

- [ ] **Step 9: Commit**

```bash
git add CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/CordaGateway.kt \
        CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RealCordaGateway.kt \
        CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/dto/FlowDtos.kt \
        CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/routes/FlowRoutes.kt \
        CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/corda/FakeCordaGateway.kt \
        CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/routes/FlowRoutesTest.kt \
        CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/corda/ResolveBankTest.kt
git commit -m "Route accept-docs/settle-payment to the trade's actual issuing bank"
```

---

### Task 5: Prove two independent bank-pair trades work on the live network

**Files:**
- Modify: `CorDapp/blockchain-layer/src/integrationTest/kotlin/com/utfl/blockchainlayer/FullLifecycleIT.kt`

**Interfaces:**
- Consumes: the full 6-container-plus-2 (8 total) live Docker network
  (Tasks 1-2) and the `issuingBank` field on `accept-docs`/`settle-payment`
  (Task 4).
- Produces: nothing consumed by other tasks — this is the plan's live-network
  proof, mirroring the role `FullLifecycleIT.kt` already played for the
  original blockchain-layer plan.

- [ ] **Step 1: Extract the existing test into a reusable helper**

In `FullLifecycleIT.kt`, replace the existing single `@Test` method's body
by extracting it into a private suspend helper, and update the client's
JSON config to ignore unknown keys (needed in Step 2 to deserialize only
the `issuingBank`/`advisingBank` fields out of `GET /trades/{linearId}`'s
full response body). Replace the whole file's contents with:

```kotlin
package com.utfl.blockchainlayer

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.fail

@Serializable
private data class FlowResultBody(val linearId: String, val txId: String, val status: String)

@Serializable
private data class TradeStateBody(val issuingBank: String, val advisingBank: String)

class FullLifecycleIT {
    private val baseUrl = System.getenv("BLOCKCHAIN_LAYER_URL") ?: "http://localhost:8081"
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

    @Test
    fun `one trade moves through all six milestones via the real REST API`() = runBlocking {
        waitForServiceReady()
        runFullLifecycle(
            lcReference = "LC-IT-0001",
            issuingBank = "IssuingBank",
            advisingBank = "AdvisingBank",
            issuingBankOverrideForLaterCalls = null
        )
    }

    @Test
    fun `two independent trades against different bank pairs both reach SETTLED concurrently`() = runBlocking {
        waitForServiceReady()

        val linearIds = awaitAll(
            async {
                runFullLifecycle(
                    lcReference = "LC-IT-BankPairA",
                    issuingBank = "IssuingBank",
                    advisingBank = "AdvisingBank",
                    issuingBankOverrideForLaterCalls = null
                )
            },
            async {
                runFullLifecycle(
                    lcReference = "LC-IT-BankPairB",
                    issuingBank = "Bank3",
                    advisingBank = "Bank4",
                    issuingBankOverrideForLaterCalls = "Bank3"
                )
            }
        )

        assertEquals(2, linearIds.distinct().size)
    }

    /**
     * Drives one trade through all six milestones plus a final read-back,
     * asserting the read-back's issuingBank/advisingBank match what was
     * requested -- proving the RPC connection actually used to advance the
     * trade was the one belonging to the named bank, not a stale default.
     *
     * [issuingBankOverrideForLaterCalls] controls what (if anything) is sent
     * in accept-docs/settle-payment's new `issuingBank` field: null omits it
     * entirely (proving the default-to-IssuingBank backward-compatibility
     * path used by ledger-monitoring's existing, unmodified calls), a
     * non-null value sends it explicitly (proving the routing fix is
     * necessary and correct for a non-default bank pair).
     */
    private suspend fun runFullLifecycle(
        lcReference: String,
        issuingBank: String,
        advisingBank: String,
        issuingBankOverrideForLaterCalls: String?
    ): String {
        val issueResponse: HttpResponse = client.post("$baseUrl/flows/issue-lc") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"exporter":"Exporter","issuingBank":"$issuingBank","advisingBank":"$advisingBank","lcReference":"$lcReference","lcTermsDocumentId":"DOC-1","lcTermsHash":"${sampleHash()}"}"""
            )
        }
        assertEquals(HttpStatusCode.Created, issueResponse.status)
        val issued: FlowResultBody = issueResponse.body()
        assertEquals("LC_ISSUED", issued.status)
        val linearId = issued.linearId

        val clearResponse = client.post("$baseUrl/flows/regulatory-clear") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","complianceOutcome":"CLEAR","documentId":"DOC-2","documentType":"WHO_GMP_CERTIFICATE","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("REGULATORY_CLEARED", clearResponse.body<FlowResultBody>().status)

        val shipResponse = client.post("$baseUrl/flows/ship-goods") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","documentId":"DOC-3","documentType":"BILL_OF_LADING","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("SHIPPED", shipResponse.body<FlowResultBody>().status)

        val acceptBody = if (issuingBankOverrideForLaterCalls != null) {
            """{"linearId":"$linearId","issuingBank":"$issuingBankOverrideForLaterCalls"}"""
        } else {
            """{"linearId":"$linearId"}"""
        }
        val acceptResponse = client.post("$baseUrl/flows/accept-docs") {
            contentType(ContentType.Application.Json)
            setBody(acceptBody)
        }
        assertEquals("ACCEPTED", acceptResponse.body<FlowResultBody>().status)

        val settleBody = if (issuingBankOverrideForLaterCalls != null) {
            """{"linearId":"$linearId","documentId":"DOC-5","documentType":"MT202","onChainHash":"${sampleHash()}","issuingBank":"$issuingBankOverrideForLaterCalls"}"""
        } else {
            """{"linearId":"$linearId","documentId":"DOC-5","documentType":"MT202","onChainHash":"${sampleHash()}"}"""
        }
        val settleResponse = client.post("$baseUrl/flows/settle-payment") {
            contentType(ContentType.Application.Json)
            setBody(settleBody)
        }
        assertEquals("SETTLED", settleResponse.body<FlowResultBody>().status)

        val closeResponse = client.post("$baseUrl/flows/regulatory-close") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","documentId":"DOC-6","documentType":"EDPMS_CLOSURE_ENTRY","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("CLOSED", closeResponse.body<FlowResultBody>().status)

        val readResponse = client.get("$baseUrl/trades/$linearId")
        assertEquals(HttpStatusCode.OK, readResponse.status)
        val trade: TradeStateBody = readResponse.body()
        assertEquals(issuingBank, trade.issuingBank)
        assertEquals(advisingBank, trade.advisingBank)

        return linearId
    }

    private suspend fun waitForServiceReady(
        timeoutMs: Long = 120_000,
        pollIntervalMs: Long = 3_000
    ) {
        val deadline = System.currentTimeMillis() + timeoutMs
        var lastError: String? = null
        while (System.currentTimeMillis() < deadline) {
            try {
                val response = client.get("$baseUrl/health")
                if (response.status == HttpStatusCode.OK) {
                    return
                }
                lastError = "GET /health returned ${response.status}"
            } catch (e: Exception) {
                lastError = "GET /health failed: ${e::class.simpleName}: ${e.message}"
            }
            delay(pollIntervalMs)
        }
        fail("blockchain-layer at $baseUrl never became ready within ${timeoutMs}ms. Last error: $lastError")
    }

    private fun sampleHash(): String {
        return (1..64).joinToString("") { "A" }
    }
}
```

- [ ] **Step 2: Run the live integration suite**

From `CorDapp/blockchain-layer`:

```bash
./scripts/run-integration-tests.sh
```

This builds and starts the full 8-container Docker Compose network (Tasks
1-2's Bank3/Bank4 included), polls `/health`, runs both `@Test` methods,
tears the network down, and propagates the exit code.

Expected: PASS, both tests green. `two independent trades against
different bank pairs both reach SETTLED concurrently` proves Trade A
(default `IssuingBank`/`AdvisingBank`, `issuingBank` field omitted from
accept-docs/settle-payment) and Trade B (`Bank3`/`Bank4`, `issuingBank`
field sent explicitly as `"Bank3"`) both independently reach `SETTLED` and
`CLOSED`, and that each trade's read-back correctly reports the bank pair
it was actually issued with.

- [ ] **Step 3: Commit**

```bash
git add CorDapp/blockchain-layer/src/integrationTest/kotlin/com/utfl/blockchainlayer/FullLifecycleIT.kt
git commit -m "Prove two independent bank-pair trades work concurrently on the live network"
```

---

### Task 6: README

**Files:**
- Modify: `CorDapp/blockchain-layer/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by other tasks — documentation only, final
  task of this plan.

- [ ] **Step 1: Update the node-count and network-topology references**

In `CorDapp/blockchain-layer/README.md`, make these targeted edits:

Replace the top description (currently "a real, Docker-deployed 4-party +
notary Corda network") with:

```markdown
A Kotlin/Ktor bridge service exposing the UTFL trade-finance CorDapp's 6 milestone
flows as a REST API, backed by a real, Docker-deployed 6-party + notary Corda
network (including a 4-bank pool: `IssuingBank`, `AdvisingBank`, `Bank3`,
`Bank4`) -- not `MockNetwork`. See
`docs/superpowers/specs/2026-07-27-blockchain-layer-design.md` and
`docs/superpowers/specs/2026-07-28-multi-bank-onboarding-design.md` for the
design.
```

Replace the `deployNodes` paragraph (currently describing 5 node
directories):

```markdown
`deployNodes` generates the 7 node directories (`build/nodes/{Notary,Importer,
Exporter,IssuingBank,AdvisingBank,Bank3,Bank4}`) that `CorDapp/docker/docker-compose.yml`
builds its images from -- rerun it whenever `contracts`/`workflows` change.
```

Replace "Then bring up all 6 containers (notary, 4 party nodes,
`blockchain-layer`)" with:

```markdown
Then bring up all 8 containers (notary, 6 party nodes, `blockchain-layer`):
```

- [ ] **Step 2: Document the bank pool and the new `issuingBank` field**

Add a new section after "## Example: drive one trade through the full
lifecycle" (before "## Build and test"):

```markdown
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
configured pool returns `400 {"error": "Unknown bank: <name>"}`.
```

- [ ] **Step 3: Commit**

```bash
git add CorDapp/blockchain-layer/README.md
git commit -m "Document the 4-bank pool and the issuingBank routing field"
```
