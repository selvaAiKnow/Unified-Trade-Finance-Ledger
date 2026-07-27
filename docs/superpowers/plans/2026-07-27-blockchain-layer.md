# blockchain-layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `blockchain-layer`, a Kotlin/Ktor bridge service that exposes the
already-built CorDapp's 6 milestone flows as a REST API, backed by a real,
Docker-deployed 4-party + notary Corda network (replacing `MockNetwork`, which is
all the CorDapp has ever run against).

**Architecture:** Two parts. (1) Real Corda network deployment: a `deployNodes`
Gradle task added to the existing `CorDapp` build, generating 4 party nodes + a
notary, each Dockerized and wired together via Docker Compose. (2) `blockchain-layer`
itself: a separate Gradle build (own Kotlin/Ktor version, independent of the
Kotlin-1.2.71-pinned CorDapp build) that holds 4 fixed `CordaRPCClient` connections
(one per party) and exposes them as a REST API — one endpoint per flow, plus two
read endpoints — behind a `CordaGateway` interface so route logic can be unit-tested
against a fake without a live network.

**Tech Stack:** Kotlin 1.9.24, Ktor 2.3.12 (server + client + content-negotiation +
status-pages), kotlinx.serialization 1.6.3, `net.corda:corda-rpc:4.10`, JUnit 5.10.2 +
kotlin-test, Gradle Shadow plugin 8.1.1 (fat jar), Docker + Docker Compose, JDK 8 for
Corda nodes / JDK 17 for `blockchain-layer` itself.

## Global Constraints

- `blockchain-layer` is its own Gradle build at `CorDapp/blockchain-layer/`, **not**
  a module of the existing `utfl-trade-finance-cordapp` build — that build pins
  Kotlin `languageVersion`/`apiVersion` to `1.2` and the Kotlin Gradle plugin itself
  to `1.2.71` for every subproject (a hard Corda 4.10 requirement), which modern
  Ktor cannot run on.
- `blockchain-layer` depends on the `contracts` and `workflows` modules' compiled
  classes as published jars (`com.utfl.tradefinance:contracts:0.1`,
  `com.utfl.tradefinance:workflows:0.1`, resolved via `mavenLocal()`) — required
  because Corda RPC's AMQP deserialization needs the real `TradeFinanceState`/
  `TradeMilestoneStatus`/etc. classes on the client's classpath, and
  `startFlowDynamic` needs the real flow classes to reference.
- Fixed 4-party + notary topology, same X.500 names the CorDapp's own
  `AbstractFlowTest.kt` already uses: `O=Importer,L=Mumbai,C=IN`,
  `O=Exporter,L=Mumbai,C=IN`, `O=IssuingBank,L=Tokyo,C=JP`,
  `O=AdvisingBank,L=Mumbai,C=IN`, notary `O=Notary,L=London,C=GB`. No dynamic
  node/party provisioning.
- Each of the 6 flow endpoints uses one fixed party's RPC connection to initiate
  (not caller-selectable): `issue-lc`/`regulatory-close` → Importer;
  `regulatory-clear`/`ship-goods` → Exporter; `accept-docs`/`settle-payment` →
  IssuingBank. Read endpoints always use the Importer connection.
- Calls are synchronous: a route handler starts the flow via RPC and blocks on
  `.returnValue.getOrThrow()` until it completes, then returns the result. No
  queue, no polling, no async job tracking.
- No authentication between services — matches the existing, unauthenticated
  `api`→`sanctions-adapter` internal HTTP convention.
- JDK 8 to run the Corda nodes themselves (hard Corda 4.x constraint, same as the
  CorDapp). `blockchain-layer`'s own JVM process runs on JDK 17 — it is a separate
  process from any Corda node, so it isn't bound by that constraint.
- Frequent commits: one commit per task, after its tests/verification pass.
- No PII, no full documents, no commercial terms ever appear in a
  `blockchain-layer` request/response body beyond what the CorDapp's own flows and
  states already carry (hashes, statuses, party names, document category/type
  strings) — this service adds no new fields, only a transport for existing ones.

---

## File Structure

```
CorDapp/
  build.gradle                          # MODIFIED: add cordformation plugin + deployNodes task
  contracts/build.gradle                # MODIFIED: add maven-publish
  workflows/build.gradle                # MODIFIED: add maven-publish
  docker/
    Dockerfile.corda-node               # generic: runs a generated node folder's corda.jar
    docker-compose.yml                  # notary + 4 party nodes + blockchain-layer
  blockchain-layer/
    settings.gradle
    build.gradle
    gradlew, gradlew.bat, gradle/wrapper/*        # own Gradle wrapper (own Kotlin/Ktor version)
    Dockerfile
    src/main/kotlin/com/utfl/blockchainlayer/
      Application.kt                    # Ktor server entrypoint, wires routes + StatusPages
      config/RpcConfig.kt               # loads the 4 RPC connection configs
      corda/CordaGateway.kt             # interface + FlowResult/TradeStateDto
      corda/RealCordaGateway.kt         # RPC-backed implementation
      corda/CordaExceptions.kt          # TradeNotFoundException, FlowRejectedException, CordaConnectionException
      routes/FlowRoutes.kt              # POST /flows/* handlers
      routes/TradeRoutes.kt             # GET /trades, GET /trades/{linearId}
      dto/FlowDtos.kt                   # @Serializable request/response bodies
    src/test/kotlin/com/utfl/blockchainlayer/
      corda/FakeCordaGateway.kt         # test double implementing CordaGateway
      routes/FlowRoutesTest.kt
      routes/TradeRoutesTest.kt
    src/integrationTest/kotlin/com/utfl/blockchainlayer/
      FullLifecycleIT.kt                # drives all 6 flows against the real docker-compose network
    scripts/
      run-integration-tests.sh          # docker compose up --wait -> gradlew integrationTest -> docker compose down
    README.md
```

---

### Task 1: Publish `contracts` and `workflows` to Maven local

**Files:**
- Modify: `CorDapp/contracts/build.gradle`
- Modify: `CorDapp/workflows/build.gradle`

**Interfaces:**
- Consumes: nothing new
- Produces: `com.utfl.tradefinance:contracts:0.1` and `com.utfl.tradefinance:workflows:0.1`, installed into the local Maven repository — consumed by `blockchain-layer`'s `build.gradle` starting in Task 4.

- [ ] **Step 1: Add the `maven-publish` plugin and a publishing block to `CorDapp/contracts/build.gradle`**

Open `CorDapp/contracts/build.gradle`. It currently starts with:

```groovy
apply plugin: 'net.corda.plugins.cordapp'
```

Add `maven-publish` alongside it, and a `publishing` block at the end of the file:

```groovy
apply plugin: 'net.corda.plugins.cordapp'
apply plugin: 'maven-publish'

cordapp {
    targetPlatformVersion corda_platform_version
    minimumPlatformVersion corda_platform_version
    contract {
        name "UTFL Trade Finance Contracts"
        vendor "UTFL"
        licence "Apache License, Version 2.0"
        versionId 1
    }
}

dependencies {
    compile "org.jetbrains.kotlin:kotlin-stdlib-jdk8:$kotlin_version"

    cordaCompile "$corda_core_release_group:corda-core:$corda_core_release_version"
    testCompile "$corda_release_group:corda-node-driver:$corda_release_version"
    testCompile "junit:junit:$junit_version"
}

publishing {
    publications {
        maven(MavenPublication) {
            groupId = project.group
            artifactId = 'contracts'
            version = project.version
            from components.java
        }
    }
}
```

(Only the two `apply plugin` lines and the new `publishing { ... }` block at the end
are new — the existing `cordapp { ... }` and `dependencies { ... }` blocks are
unchanged.)

- [ ] **Step 2: Add the same to `CorDapp/workflows/build.gradle`**

Read `CorDapp/workflows/build.gradle` first to see its exact current contents, then
apply the same two changes: add `apply plugin: 'maven-publish'` under its existing
`apply plugin: 'net.corda.plugins.cordapp'` line, and append this `publishing`
block at the end of the file (artifact id `workflows` instead of `contracts`):

```groovy
publishing {
    publications {
        maven(MavenPublication) {
            groupId = project.group
            artifactId = 'workflows'
            version = project.version
            from components.java
        }
    }
}
```

- [ ] **Step 3: Publish both to Maven local**

Run (from `CorDapp/`, with `JAVA_HOME` pointed at a JDK 8 install — see the
project's established environment note if `./gradlew` fails with a
`ReflectionCache`/`Java7` error):

```bash
./gradlew :contracts:publishToMavenLocal :workflows:publishToMavenLocal
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Verify the artifacts landed in the local Maven repo**

Run:

```bash
find ~/.m2/repository/com/utfl/tradefinance -type f -name "*.jar"
```

Expected output includes both:

```
.../com/utfl/tradefinance/contracts/0.1/contracts-0.1.jar
.../com/utfl/tradefinance/workflows/0.1/workflows-0.1.jar
```

- [ ] **Step 5: Commit**

```bash
git add contracts/build.gradle workflows/build.gradle
git commit -m "Publish contracts and workflows to Maven local for blockchain-layer"
```

---

### Task 2: Add `deployNodes` to generate the 4-party + notary network

**Files:**
- Modify: `CorDapp/build.gradle`

**Interfaces:**
- Consumes: nothing new
- Produces: `CorDapp/build/nodes/{Notary,Importer,Exporter,IssuingBank,AdvisingBank}/` folders, each containing `corda.jar`, `node.conf`, and the `contracts`/`workflows` cordapp jars in a `cordapps/` subfolder — consumed by Task 3's Dockerfile/docker-compose.

- [ ] **Step 1: Add the `cordformation` plugin to the buildscript classpath**

In `CorDapp/build.gradle`, find the `buildscript { ... dependencies { ... } }`
block:

```groovy
    dependencies {
        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
        classpath "net.corda.plugins:cordapp:$corda_gradle_plugins_version"
        classpath "net.corda.plugins:quasar-utils:$corda_gradle_plugins_version"
    }
```

Add one line so it reads:

```groovy
    dependencies {
        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
        classpath "net.corda.plugins:cordapp:$corda_gradle_plugins_version"
        classpath "net.corda.plugins:quasar-utils:$corda_gradle_plugins_version"
        classpath "net.corda.plugins:cordformation:$corda_gradle_plugins_version"
    }
```

- [ ] **Step 2: Apply the plugin and add the `deployNodes` task at the end of the root `CorDapp/build.gradle`**

Append this to the end of the file (after the existing `allprojects { ... }`
block):

```groovy
apply plugin: 'net.corda.plugins.cordformation'

task deployNodes(type: net.corda.plugins.Cordform, dependsOn: ['jar']) {
    directory "./build/nodes"
    notary(name: "O=Notary,L=London,C=GB")

    node {
        name "O=Importer,L=Mumbai,C=IN"
        p2pPort 10005
        rpcSettings {
            address "localhost:10006"
            adminAddress "localhost:10046"
        }
        rpcUsers = [[user: "importerRpc", password: "importerpass", permissions: ["ALL"]]]
        projectCordapp {
            deploy = false
        }
        cordapps = ["$corda_release_group:corda-finance-contracts:$corda_release_version",
                    "$corda_release_group:corda-finance-workflows:$corda_release_version"].minus(
                    ["$corda_release_group:corda-finance-contracts:$corda_release_version",
                     "$corda_release_group:corda-finance-workflows:$corda_release_version"])
        cordapp project(':contracts')
        cordapp project(':workflows')
    }

    node {
        name "O=Exporter,L=Mumbai,C=IN"
        p2pPort 10007
        rpcSettings {
            address "localhost:10008"
            adminAddress "localhost:10048"
        }
        rpcUsers = [[user: "exporterRpc", password: "exporterpass", permissions: ["ALL"]]]
        cordapp project(':contracts')
        cordapp project(':workflows')
    }

    node {
        name "O=IssuingBank,L=Tokyo,C=JP"
        p2pPort 10009
        rpcSettings {
            address "localhost:10010"
            adminAddress "localhost:10050"
        }
        rpcUsers = [[user: "issuingBankRpc", password: "issuingbankpass", permissions: ["ALL"]]]
        cordapp project(':contracts')
        cordapp project(':workflows')
    }

    node {
        name "O=AdvisingBank,L=Mumbai,C=IN"
        p2pPort 10011
        rpcSettings {
            address "localhost:10012"
            adminAddress "localhost:10052"
        }
        rpcUsers = [[user: "advisingBankRpc", password: "advisingbankpass", permissions: ["ALL"]]]
        cordapp project(':contracts')
        cordapp project(':workflows')
    }
}
```

Remove the stray `cordapps = [...]` line under the `Importer` node block above if
your Gradle/Cordform version rejects it — it was left in by mistake during drafting
and does nothing useful (it computes an empty list). The four `cordapp
project(':contracts')` / `cordapp project(':workflows')` lines per node are the
ones that actually matter: they tell Cordform to bundle this project's own
contracts/workflows jars into each generated node's `cordapps/` folder.

- [ ] **Step 3: Fix the draft — remove the dead `cordapps = [...]` line**

Re-open `CorDapp/build.gradle` and delete these two lines from inside the
`Importer` node block (they were a leftover no-op from drafting, per the note in
Step 2):

```groovy
        cordapps = ["$corda_release_group:corda-finance-contracts:$corda_release_version",
                    "$corda_release_group:corda-finance-workflows:$corda_release_version"].minus(
                    ["$corda_release_group:corda-finance-contracts:$corda_release_version",
                     "$corda_release_group:corda-finance-workflows:$corda_release_version"])
```

The `Importer` node block should now read:

```groovy
    node {
        name "O=Importer,L=Mumbai,C=IN"
        p2pPort 10005
        rpcSettings {
            address "localhost:10006"
            adminAddress "localhost:10046"
        }
        rpcUsers = [[user: "importerRpc", password: "importerpass", permissions: ["ALL"]]]
        projectCordapp {
            deploy = false
        }
        cordapp project(':contracts')
        cordapp project(':workflows')
    }
```

- [ ] **Step 4: Run `deployNodes` and verify the output**

```bash
JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-8.0.492.9-hotspot" ./gradlew deployNodes
ls build/nodes
```

Expected: `BUILD SUCCESSFUL`, and `build/nodes/` contains `Notary/`, `Importer/`,
`Exporter/`, `IssuingBank/`, `AdvisingBank/`, each with a `corda.jar`, `node.conf`,
and a `cordapps/` subfolder containing `contracts-0.1.jar` and `workflows-0.1.jar`.

```bash
ls build/nodes/Importer
ls build/nodes/Importer/cordapps
```

Expected: `corda.jar`, `node.conf`, `cordapps/`, `additional-node-infos/`,
`network-parameters` present; `cordapps/` contains both jars.

- [ ] **Step 5: Commit**

```bash
git add build.gradle
git commit -m "Add deployNodes task for the 4-party + notary Corda network"
```

---

### Task 3: Dockerize the generated network with Docker Compose

**Files:**
- Create: `CorDapp/docker/Dockerfile.corda-node`
- Create: `CorDapp/docker/docker-compose.yml`

**Interfaces:**
- Consumes: `CorDapp/build/nodes/*` (Task 2's output)
- Produces: a running 5-container Corda network (notary + 4 parties) reachable at
  fixed `localhost` ports from the host — consumed by Task 5 (RPC connections) and
  Task 12 (integration test).

- [ ] **Step 1: Write the generic node Dockerfile**

Create `CorDapp/docker/Dockerfile.corda-node`:

```dockerfile
FROM eclipse-temurin:8-jre

WORKDIR /opt/corda

COPY . /opt/corda

EXPOSE 10000-10999

ENTRYPOINT ["java", "-jar", "corda.jar"]
```

This is deliberately generic — it doesn't know which party it is. Each
`docker-compose.yml` service points its `build.context` at a specific
`build/nodes/<PartyName>/` directory (which already contains `corda.jar` and
`node.conf` from `deployNodes`), so the same Dockerfile builds a working image for
any of the 5 nodes.

- [ ] **Step 2: Write `docker-compose.yml`**

Create `CorDapp/docker/docker-compose.yml`:

```yaml
version: "3.8"
services:
  notary:
    build:
      context: ../build/nodes/Notary
      dockerfile: ../../docker/Dockerfile.corda-node
    container_name: corda-notary
    networks:
      - corda-network

  importer-node:
    build:
      context: ../build/nodes/Importer
      dockerfile: ../../docker/Dockerfile.corda-node
    container_name: corda-importer
    ports:
      - "10006:10006"
    networks:
      - corda-network
    depends_on:
      - notary

  exporter-node:
    build:
      context: ../build/nodes/Exporter
      dockerfile: ../../docker/Dockerfile.corda-node
    container_name: corda-exporter
    ports:
      - "10008:10008"
    networks:
      - corda-network
    depends_on:
      - notary

  issuingbank-node:
    build:
      context: ../build/nodes/IssuingBank
      dockerfile: ../../docker/Dockerfile.corda-node
    container_name: corda-issuingbank
    ports:
      - "10010:10010"
    networks:
      - corda-network
    depends_on:
      - notary

  advisingbank-node:
    build:
      context: ../build/nodes/AdvisingBank
      dockerfile: ../../docker/Dockerfile.corda-node
    container_name: corda-advisingbank
    ports:
      - "10012:10012"
    networks:
      - corda-network
    depends_on:
      - notary

networks:
  corda-network:
    driver: bridge
```

Only the 4 party nodes' RPC ports (10006/10008/10010/10012 — matching Task 2's
`rpcSettings.address` ports) are published to the host; the notary and the P2P
ports don't need host exposure since only RPC calls from `blockchain-layer` (added
in Task 4, running on the host or joining this same `corda-network` later) need to
reach them from outside the compose network.

- [ ] **Step 3: Bring the network up and verify**

```bash
cd docker
docker compose up -d --build
docker compose ps
```

Expected: all 5 containers show state `running` (or `Up`).

```bash
docker compose logs importer-node --tail 30
```

Expected: log lines showing the node started and is listening for RPC connections
(look for a line mentioning the RPC address, e.g. `startRpcServer` reaching
`localhost:10006` inside the container).

- [ ] **Step 4: Tear down**

```bash
docker compose down
```

- [ ] **Step 5: Commit**

```bash
git add docker/Dockerfile.corda-node docker/docker-compose.yml
git commit -m "Add Docker Compose deployment for the 4-party Corda network"
```

---

### Task 4: Scaffold `blockchain-layer`'s own Gradle/Ktor project

**Files:**
- Create: `CorDapp/blockchain-layer/settings.gradle`
- Create: `CorDapp/blockchain-layer/build.gradle`
- Create: `CorDapp/blockchain-layer/gradle.properties`
- Create: `CorDapp/blockchain-layer/gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.properties`, `gradle/wrapper/gradle-wrapper.jar`
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/Application.kt`
- Test: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/ApplicationTest.kt`

**Interfaces:**
- Consumes: nothing new
- Produces: a running Ktor server with a `GET /health` endpoint, and the Gradle
  project structure (`ktor { }`/`application { }` plugins, dependency set) every
  later task in this plan adds routes/classes to.

- [ ] **Step 1: Generate the Gradle wrapper**

From `CorDapp/blockchain-layer/` (create the directory first if it doesn't exist),
run, using a Gradle already on `PATH` (any recent Gradle works — this only writes
wrapper files, it doesn't build anything with the old Corda-pinned toolchain):

```bash
mkdir -p CorDapp/blockchain-layer
cd CorDapp/blockchain-layer
gradle wrapper --gradle-version 8.7
```

Expected: `gradlew`, `gradlew.bat`, and `gradle/wrapper/gradle-wrapper.{jar,properties}`
are created.

- [ ] **Step 2: Write `settings.gradle`**

Create `CorDapp/blockchain-layer/settings.gradle`:

```groovy
rootProject.name = 'blockchain-layer'
```

- [ ] **Step 3: Write `gradle.properties`**

Create `CorDapp/blockchain-layer/gradle.properties`:

```properties
group=com.utfl.blockchainlayer
version=0.1
kotlin.code.style=official
```

- [ ] **Step 4: Write `build.gradle`**

Create `CorDapp/blockchain-layer/build.gradle`:

```groovy
plugins {
    id 'org.jetbrains.kotlin.jvm' version '1.9.24'
    id 'org.jetbrains.kotlin.plugin.serialization' version '1.9.24'
    id 'application'
    id 'com.github.johnrengelman.shadow' version '8.1.1'
}

application {
    mainClass = 'com.utfl.blockchainlayer.ApplicationKt'
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(17)
    }
}

repositories {
    mavenLocal()
    mavenCentral()
    maven { url 'https://download.corda.net/maven/corda-dependencies' }
    maven { url 'https://download.corda.net/maven/corda-releases' }
}

ext {
    ktor_version = '2.3.12'
}

dependencies {
    implementation "io.ktor:ktor-server-core-jvm:$ktor_version"
    implementation "io.ktor:ktor-server-netty-jvm:$ktor_version"
    implementation "io.ktor:ktor-server-content-negotiation-jvm:$ktor_version"
    implementation "io.ktor:ktor-serialization-kotlinx-json-jvm:$ktor_version"
    implementation "io.ktor:ktor-server-status-pages-jvm:$ktor_version"
    implementation "org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3"
    implementation "ch.qos.logback:logback-classic:1.5.6"

    implementation "net.corda:corda-rpc:4.10"
    implementation "com.utfl.tradefinance:contracts:0.1"
    implementation "com.utfl.tradefinance:workflows:0.1"

    testImplementation "io.ktor:ktor-server-test-host-jvm:$ktor_version"
    testImplementation "org.jetbrains.kotlin:kotlin-test-junit5"
    testImplementation "org.junit.jupiter:junit-jupiter:5.10.2"
}

test {
    useJUnitPlatform()
}

shadowJar {
    archiveBaseName.set('blockchain-layer')
    archiveClassifier.set('')
    mergeServiceFiles()
}
```

- [ ] **Step 5: Write the failing test `ApplicationTest.kt`**

Create `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/ApplicationTest.kt`:

```kotlin
package com.utfl.blockchainlayer

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class ApplicationTest {
    @Test
    fun `health endpoint returns ok`() = testApplication {
        application { module() }
        val response = client.get("/health")
        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("""{"status":"ok"}""", response.bodyAsText())
    }
}
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
cd CorDapp/blockchain-layer
./gradlew test
```

Expected: FAIL — compile error, `module` is unresolved (no `Application.kt` yet).

- [ ] **Step 7: Write `Application.kt`**

Create `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/Application.kt`:

```kotlin
package com.utfl.blockchainlayer

import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json

fun main() {
    embeddedServer(Netty, port = 8081, host = "0.0.0.0", module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true })
    }
    routing {
        get("/health") {
            call.respondText("""{"status":"ok"}""", io.ktor.http.ContentType.Application.Json)
        }
    }
}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
./gradlew test
```

Expected: `BUILD SUCCESSFUL`, 1 test passed.

- [ ] **Step 9: Commit**

```bash
git add settings.gradle build.gradle gradle.properties gradlew gradlew.bat gradle/wrapper src/main/kotlin/com/utfl/blockchainlayer/Application.kt src/test/kotlin/com/utfl/blockchainlayer/ApplicationTest.kt
git commit -m "Scaffold blockchain-layer Ktor project with a health endpoint"
```

---

### Task 5: `CordaGateway` interface, exceptions, and `FakeCordaGateway`

**Files:**
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/CordaGateway.kt`
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/CordaExceptions.kt`
- Create: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/corda/FakeCordaGateway.kt`

**Interfaces:**
- Consumes: nothing new
- Produces: `CordaGateway` interface, `FlowResult`, `TradeStateDto`,
  `TradeNotFoundException`, `FlowRejectedException`, `CordaConnectionException` —
  consumed by every route in Tasks 7-10, and by `RealCordaGateway` (Task 6) and
  `FakeCordaGateway` (this task, used by every route test in Tasks 7-10).

- [ ] **Step 1: Write `CordaGateway.kt`**

Create `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/CordaGateway.kt`:

```kotlin
package com.utfl.blockchainlayer.corda

data class FlowResult(
    val linearId: String,
    val txId: String,
    val status: String
)

data class DocumentHashRecordDto(
    val documentId: String,
    val category: String,
    val documentType: String,
    val onChainHash: String,
    val milestone: String,
    val anchoredAt: String
)

data class TradeStateDto(
    val linearId: String,
    val lcReference: String,
    val importer: String,
    val exporter: String,
    val issuingBank: String,
    val advisingBank: String,
    val lcTermsHash: String,
    val status: String,
    val complianceOutcome: String?,
    val documentHashes: List<DocumentHashRecordDto>
)

interface CordaGateway {
    fun issueLC(
        exporter: String,
        issuingBank: String,
        advisingBank: String,
        lcReference: String,
        lcTermsDocumentId: String,
        lcTermsHash: String
    ): FlowResult

    fun regulatoryClear(
        linearId: String,
        complianceOutcome: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun shipGoods(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun acceptDocs(linearId: String): FlowResult

    fun settlePayment(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun regulatoryClose(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun getTrade(linearId: String): TradeStateDto

    fun listTrades(): List<TradeStateDto>
}
```

- [ ] **Step 2: Write `CordaExceptions.kt`**

Create `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/CordaExceptions.kt`:

```kotlin
package com.utfl.blockchainlayer.corda

class TradeNotFoundException(linearId: String) : RuntimeException("No trade found with linearId=$linearId")

class FlowRejectedException(message: String) : RuntimeException(message)

class CordaConnectionException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
```

- [ ] **Step 3: Write `FakeCordaGateway.kt`**

Create `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/corda/FakeCordaGateway.kt`:

```kotlin
package com.utfl.blockchainlayer.corda

class FakeCordaGateway : CordaGateway {
    var issueLCResult: FlowResult? = null
    var issueLCError: Throwable? = null
    var lastIssueLCArgs: List<Any?>? = null

    var regulatoryClearResult: FlowResult? = null
    var regulatoryClearError: Throwable? = null
    var lastRegulatoryClearArgs: List<Any?>? = null

    var shipGoodsResult: FlowResult? = null
    var shipGoodsError: Throwable? = null
    var lastShipGoodsArgs: List<Any?>? = null

    var acceptDocsResult: FlowResult? = null
    var acceptDocsError: Throwable? = null
    var lastAcceptDocsArgs: List<Any?>? = null

    var settlePaymentResult: FlowResult? = null
    var settlePaymentError: Throwable? = null
    var lastSettlePaymentArgs: List<Any?>? = null

    var regulatoryCloseResult: FlowResult? = null
    var regulatoryCloseError: Throwable? = null
    var lastRegulatoryCloseArgs: List<Any?>? = null

    var tradeToReturn: TradeStateDto? = null
    var tradesToReturn: List<TradeStateDto> = emptyList()
    var getTradeError: Throwable? = null

    override fun issueLC(
        exporter: String,
        issuingBank: String,
        advisingBank: String,
        lcReference: String,
        lcTermsDocumentId: String,
        lcTermsHash: String
    ): FlowResult {
        lastIssueLCArgs = listOf(exporter, issuingBank, advisingBank, lcReference, lcTermsDocumentId, lcTermsHash)
        issueLCError?.let { throw it }
        return issueLCResult ?: error("issueLCResult not configured")
    }

    override fun regulatoryClear(
        linearId: String,
        complianceOutcome: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult {
        lastRegulatoryClearArgs = listOf(linearId, complianceOutcome, documentId, documentType, onChainHash)
        regulatoryClearError?.let { throw it }
        return regulatoryClearResult ?: error("regulatoryClearResult not configured")
    }

    override fun shipGoods(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        lastShipGoodsArgs = listOf(linearId, documentId, documentType, onChainHash)
        shipGoodsError?.let { throw it }
        return shipGoodsResult ?: error("shipGoodsResult not configured")
    }

    override fun acceptDocs(linearId: String): FlowResult {
        lastAcceptDocsArgs = listOf(linearId)
        acceptDocsError?.let { throw it }
        return acceptDocsResult ?: error("acceptDocsResult not configured")
    }

    override fun settlePayment(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        lastSettlePaymentArgs = listOf(linearId, documentId, documentType, onChainHash)
        settlePaymentError?.let { throw it }
        return settlePaymentResult ?: error("settlePaymentResult not configured")
    }

    override fun regulatoryClose(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        lastRegulatoryCloseArgs = listOf(linearId, documentId, documentType, onChainHash)
        regulatoryCloseError?.let { throw it }
        return regulatoryCloseResult ?: error("regulatoryCloseResult not configured")
    }

    override fun getTrade(linearId: String): TradeStateDto {
        getTradeError?.let { throw it }
        return tradeToReturn ?: throw TradeNotFoundException(linearId)
    }

    override fun listTrades(): List<TradeStateDto> = tradesToReturn
}
```

This is a hand-written test double (no mocking library dependency needed) — each
flow method records its args and either returns a pre-configured result or throws a
pre-configured error, so route tests (Tasks 7-10) can assert both "was the gateway
called correctly" and "does the route surface a gateway error as the right HTTP
status."

- [ ] **Step 4: Verify it compiles**

```bash
cd CorDapp/blockchain-layer
./gradlew compileTestKotlin
```

Expected: `BUILD SUCCESSFUL`. (No new runtime behavior yet — this task only adds
types and a test double, nothing to assert with a test until Task 7 uses it.)

- [ ] **Step 5: Commit**

```bash
git add src/main/kotlin/com/utfl/blockchainlayer/corda/CordaGateway.kt src/main/kotlin/com/utfl/blockchainlayer/corda/CordaExceptions.kt src/test/kotlin/com/utfl/blockchainlayer/corda/FakeCordaGateway.kt
git commit -m "Add CordaGateway interface, exceptions, and a fake test double"
```

---

### Task 6: `RealCordaGateway` — RPC-backed implementation

**Files:**
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RpcConnections.kt`
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RealCordaGateway.kt`

**Interfaces:**
- Consumes: `CordaGateway`, `FlowResult`, `TradeStateDto`, `DocumentHashRecordDto`,
  `TradeNotFoundException`, `FlowRejectedException`, `CordaConnectionException`
  (Task 5)
- Produces: `RpcConnections` (holds the 4 party `CordaRPCOps` connections),
  `RealCordaGateway(connections: RpcConnections) : CordaGateway` — wired into
  `Application.kt` starting in Task 7. Not unit-tested here (it needs a live
  network); exercised by Task 12's integration test.

- [ ] **Step 1: Write `RpcConnections.kt`**

Create `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RpcConnections.kt`:

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
    issuingBankConfig: PartyRpcConfig,
    advisingBankConfig: PartyRpcConfig
) : AutoCloseable {
    private val importerConnection = connect(importerConfig)
    private val exporterConnection = connect(exporterConfig)
    private val issuingBankConnection = connect(issuingBankConfig)
    private val advisingBankConnection = connect(advisingBankConfig)

    val importer: CordaRPCOps get() = importerConnection.proxy
    val exporter: CordaRPCOps get() = exporterConnection.proxy
    val issuingBank: CordaRPCOps get() = issuingBankConnection.proxy
    val advisingBank: CordaRPCOps get() = advisingBankConnection.proxy

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
        issuingBankConnection.notifyServerAndClose()
        advisingBankConnection.notifyServerAndClose()
    }
}

object RpcConfigLoader {
    fun fromEnv(): RpcConnections {
        fun config(prefix: String, defaultPort: Int, defaultUser: String, defaultPassword: String) = PartyRpcConfig(
            host = System.getenv("${prefix}_RPC_HOST") ?: "localhost",
            port = (System.getenv("${prefix}_RPC_PORT") ?: defaultPort.toString()).toInt(),
            username = System.getenv("${prefix}_RPC_USER") ?: defaultUser,
            password = System.getenv("${prefix}_RPC_PASSWORD") ?: defaultPassword
        )

        return RpcConnections(
            importerConfig = config("IMPORTER", 10006, "importerRpc", "importerpass"),
            exporterConfig = config("EXPORTER", 10008, "exporterRpc", "exporterpass"),
            issuingBankConfig = config("ISSUING_BANK", 10010, "issuingBankRpc", "issuingbankpass"),
            advisingBankConfig = config("ADVISING_BANK", 10012, "advisingBankRpc", "advisingbankpass")
        )
    }
}
```

Defaults match Task 2's `rpcUsers`/`rpcSettings` exactly, so this works against the
Docker Compose network from Task 3 with zero environment variables set; the env
vars exist so a future deployment can point at different hosts/ports/credentials
without a code change.

- [ ] **Step 2: Write `RealCordaGateway.kt`**

Create `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RealCordaGateway.kt`:

```kotlin
package com.utfl.blockchainlayer.corda

import com.utfl.tradefinance.ComplianceOutcome
import com.utfl.tradefinance.DocumentHashRecord
import com.utfl.tradefinance.TradeFinanceState
import com.utfl.tradefinance.flows.AcceptDocsFlow
import com.utfl.tradefinance.flows.IssueLCFlow
import com.utfl.tradefinance.flows.RegulatoryClearFlow
import com.utfl.tradefinance.flows.RegulatoryCloseFlow
import com.utfl.tradefinance.flows.SettlePaymentFlow
import com.utfl.tradefinance.flows.ShipGoodsFlow
import net.corda.core.contracts.StateAndRef
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.flows.FlowException
import net.corda.core.identity.Party
import net.corda.core.messaging.CordaRPCOps
import net.corda.core.messaging.vaultQueryBy
import net.corda.core.node.services.Vault
import net.corda.core.node.services.vault.QueryCriteria
import net.corda.core.transactions.SignedTransaction
import net.corda.core.utilities.getOrThrow

class RealCordaGateway(private val connections: RpcConnections) : CordaGateway {

    override fun issueLC(
        exporter: String,
        issuingBank: String,
        advisingBank: String,
        lcReference: String,
        lcTermsDocumentId: String,
        lcTermsHash: String
    ): FlowResult {
        val ops = connections.importer
        val exporterParty = resolveParty(ops, exporter)
        val issuingBankParty = resolveParty(ops, issuingBank)
        val advisingBankParty = resolveParty(ops, advisingBank)

        val stx = runFlow {
            ops.startFlowDynamic(
                IssueLCFlow.Initiator::class.java,
                issuingBankParty,
                exporterParty,
                advisingBankParty,
                lcReference,
                lcTermsDocumentId,
                SecureHash.parse(lcTermsHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun regulatoryClear(
        linearId: String,
        complianceOutcome: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult {
        val ops = connections.exporter
        val stx = runFlow {
            ops.startFlowDynamic(
                RegulatoryClearFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                ComplianceOutcome.valueOf(complianceOutcome),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun shipGoods(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.exporter
        val stx = runFlow {
            ops.startFlowDynamic(
                ShipGoodsFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun acceptDocs(linearId: String): FlowResult {
        val ops = connections.issuingBank
        val stx = runFlow {
            ops.startFlowDynamic(
                AcceptDocsFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun settlePayment(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.issuingBank
        val stx = runFlow {
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

    override fun regulatoryClose(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.importer
        val stx = runFlow {
            ops.startFlowDynamic(
                RegulatoryCloseFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun getTrade(linearId: String): TradeStateDto {
        val stateAndRef = queryOne(connections.importer, UniqueIdentifier.fromString(linearId))
            ?: throw TradeNotFoundException(linearId)
        return toDto(stateAndRef)
    }

    override fun listTrades(): List<TradeStateDto> {
        val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
        return connections.importer.vaultQueryBy<TradeFinanceState>(criteria).states.map { toDto(it) }
    }

    private fun queryOne(ops: CordaRPCOps, linearId: UniqueIdentifier): StateAndRef<TradeFinanceState>? {
        val criteria = QueryCriteria.LinearStateQueryCriteria(
            linearId = listOf(linearId),
            status = Vault.StateStatus.UNCONSUMED
        )
        return ops.vaultQueryBy<TradeFinanceState>(criteria).states.singleOrNull()
    }

    private fun resolveParty(ops: CordaRPCOps, commonName: String): Party {
        val x500Name = ops.networkMapSnapshot()
            .flatMap { it.legalIdentities }
            .firstOrNull { it.name.organisation == commonName }
            ?: throw FlowRejectedException("Unknown party '$commonName'")
        return x500Name
    }

    private fun toFlowResult(stx: SignedTransaction): FlowResult {
        val state = stx.tx.outputsOfType<TradeFinanceState>().single()
        return FlowResult(
            linearId = state.linearId.id.toString(),
            txId = stx.id.toString(),
            status = state.status.name
        )
    }

    private fun toDto(stateAndRef: StateAndRef<TradeFinanceState>): TradeStateDto {
        val state = stateAndRef.state.data
        return TradeStateDto(
            linearId = state.linearId.id.toString(),
            lcReference = state.lcReference,
            importer = state.importer.name.organisation,
            exporter = state.exporter.name.organisation,
            issuingBank = state.issuingBank.name.organisation,
            advisingBank = state.advisingBank.name.organisation,
            lcTermsHash = state.lcTermsHash.toString(),
            status = state.status.name,
            complianceOutcome = state.complianceOutcome?.name,
            documentHashes = state.documentHashes.map { toDto(it) }
        )
    }

    private fun toDto(record: DocumentHashRecord): DocumentHashRecordDto = DocumentHashRecordDto(
        documentId = record.documentId,
        category = record.category,
        documentType = record.documentType,
        onChainHash = record.onChainHash.toString(),
        milestone = record.milestone.name,
        anchoredAt = record.anchoredAt.toString()
    )

    private fun <T> runFlow(block: () -> T): T {
        return try {
            block()
        } catch (e: FlowException) {
            throw FlowRejectedException(e.message ?: "Flow was rejected")
        }
    }
}
```

`resolveParty` looks up a party by its X.500 `organisation` field (e.g.
`"Exporter"`) via the calling node's own network map snapshot — this is how the
REST API can accept plain names like `"Exporter"` rather than full X.500 strings,
per the spec's "pure Corda party terms" decision.

- [ ] **Step 3: Verify it compiles**

```bash
cd CorDapp/blockchain-layer
./gradlew compileKotlin
```

Expected: `BUILD SUCCESSFUL`. (No test yet — `RealCordaGateway` needs a live RPC
connection to exercise meaningfully; it's covered by Task 12's integration test,
not a unit test here.)

- [ ] **Step 4: Commit**

```bash
git add src/main/kotlin/com/utfl/blockchainlayer/corda/RpcConnections.kt src/main/kotlin/com/utfl/blockchainlayer/corda/RealCordaGateway.kt
git commit -m "Add RealCordaGateway: RPC-backed CordaGateway implementation"
```

---

### Task 7: `issue-lc` and `regulatory-close` endpoints (Importer-initiated)

**Files:**
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/dto/FlowDtos.kt`
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/routes/FlowRoutes.kt`
- Test: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/routes/FlowRoutesTest.kt`
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/Application.kt`

**Interfaces:**
- Consumes: `CordaGateway`, `FlowResult`, `FakeCordaGateway` (Task 5)
- Produces: `POST /flows/issue-lc`, `POST /flows/regulatory-close` — the routing
  pattern (DTOs, `installFlowRoutes(gateway)`) every later flow-endpoint task
  (8, 9) extends.

- [ ] **Step 1: Write the failing test `FlowRoutesTest.kt`**

Create `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/routes/FlowRoutesTest.kt`:

```kotlin
package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.FakeCordaGateway
import com.utfl.blockchainlayer.corda.FlowResult
import com.utfl.blockchainlayer.module
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class FlowRoutesTest {
    @Test
    fun `POST flows issue-lc calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.issueLCResult = FlowResult(linearId = "abc-123", txId = "tx-1", status = "LC_ISSUED")
        application { module(gateway) }

        val response = client.post("/flows/issue-lc") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-2026-0001","lcTermsDocumentId":"DOC-1","lcTermsHash":"ABCD"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-1","status":"LC_ISSUED"}""",
            response.bodyAsText()
        )
        assertEquals(
            listOf("Exporter", "IssuingBank", "AdvisingBank", "LC-2026-0001", "DOC-1", "ABCD"),
            gateway.lastIssueLCArgs
        )
    }

    @Test
    fun `POST flows regulatory-close calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.regulatoryCloseResult = FlowResult(linearId = "abc-123", txId = "tx-6", status = "CLOSED")
        application { module(gateway) }

        val response = client.post("/flows/regulatory-close") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","documentId":"DOC-6","documentType":"EDPMS_CLOSURE_ENTRY","onChainHash":"EF01"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-6","status":"CLOSED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-6", "EDPMS_CLOSURE_ENTRY", "EF01"), gateway.lastRegulatoryCloseArgs)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd CorDapp/blockchain-layer
./gradlew test
```

Expected: FAIL — compile error, `module(gateway)` overload doesn't exist yet
(`Application.module()` currently takes no arguments).

- [ ] **Step 3: Write `FlowDtos.kt`**

Create `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/dto/FlowDtos.kt`:

```kotlin
package com.utfl.blockchainlayer.dto

import kotlinx.serialization.Serializable

@Serializable
data class IssueLCRequest(
    val exporter: String,
    val issuingBank: String,
    val advisingBank: String,
    val lcReference: String,
    val lcTermsDocumentId: String,
    val lcTermsHash: String
)

@Serializable
data class RegulatoryClearRequest(
    val linearId: String,
    val complianceOutcome: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)

@Serializable
data class ShipGoodsRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)

@Serializable
data class AcceptDocsRequest(val linearId: String)

@Serializable
data class SettlePaymentRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)

@Serializable
data class RegulatoryCloseRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)

@Serializable
data class FlowResultResponse(
    val linearId: String,
    val txId: String,
    val status: String
)
```

- [ ] **Step 4: Write `FlowRoutes.kt`**

Create `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/routes/FlowRoutes.kt`:

```kotlin
package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.CordaGateway
import com.utfl.blockchainlayer.corda.FlowResult
import com.utfl.blockchainlayer.dto.FlowResultResponse
import com.utfl.blockchainlayer.dto.IssueLCRequest
import com.utfl.blockchainlayer.dto.RegulatoryCloseRequest
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post

fun Route.flowRoutes(gateway: CordaGateway) {
    post("/flows/issue-lc") {
        val body = call.receive<IssueLCRequest>()
        val result = gateway.issueLC(
            exporter = body.exporter,
            issuingBank = body.issuingBank,
            advisingBank = body.advisingBank,
            lcReference = body.lcReference,
            lcTermsDocumentId = body.lcTermsDocumentId,
            lcTermsHash = body.lcTermsHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/regulatory-close") {
        val body = call.receive<RegulatoryCloseRequest>()
        val result = gateway.regulatoryClose(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }
}

fun FlowResult.toResponse() = FlowResultResponse(linearId = linearId, txId = txId, status = status)
```

- [ ] **Step 5: Wire it into `Application.kt`**

Replace the contents of `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/Application.kt`:

```kotlin
package com.utfl.blockchainlayer

import com.utfl.blockchainlayer.corda.CordaGateway
import com.utfl.blockchainlayer.corda.RealCordaGateway
import com.utfl.blockchainlayer.corda.RpcConfigLoader
import com.utfl.blockchainlayer.routes.flowRoutes
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json

fun main() {
    val connections = RpcConfigLoader.fromEnv()
    val gateway = RealCordaGateway(connections)
    embeddedServer(Netty, port = 8081, host = "0.0.0.0") { module(gateway) }
        .start(wait = true)
}

fun Application.module(gateway: CordaGateway) {
    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true })
    }
    routing {
        get("/health") {
            call.respondText("""{"status":"ok"}""", io.ktor.http.ContentType.Application.Json)
        }
        flowRoutes(gateway)
    }
}
```

This replaces the parameterless `module()` from Task 4 with a `module(gateway:
CordaGateway)` that both `main()` (using the real gateway) and tests (using the
fake) call — update `ApplicationTest.kt` from Task 4 accordingly:

- [ ] **Step 6: Update `ApplicationTest.kt` for the new `module(gateway)` signature**

Replace `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/ApplicationTest.kt`:

```kotlin
package com.utfl.blockchainlayer

import com.utfl.blockchainlayer.corda.FakeCordaGateway
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class ApplicationTest {
    @Test
    fun `health endpoint returns ok`() = testApplication {
        application { module(FakeCordaGateway()) }
        val response = client.get("/health")
        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("""{"status":"ok"}""", response.bodyAsText())
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd CorDapp/blockchain-layer
./gradlew test
```

Expected: `BUILD SUCCESSFUL`, 3 tests passed (`ApplicationTest` + 2 in
`FlowRoutesTest`).

- [ ] **Step 8: Commit**

```bash
git add src/main/kotlin/com/utfl/blockchainlayer/dto/FlowDtos.kt src/main/kotlin/com/utfl/blockchainlayer/routes/FlowRoutes.kt src/main/kotlin/com/utfl/blockchainlayer/Application.kt src/test/kotlin/com/utfl/blockchainlayer/routes/FlowRoutesTest.kt src/test/kotlin/com/utfl/blockchainlayer/ApplicationTest.kt
git commit -m "Add issue-lc and regulatory-close flow endpoints"
```

---

### Task 8: `regulatory-clear` and `ship-goods` endpoints (Exporter-initiated)

**Files:**
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/routes/FlowRoutes.kt`
- Modify: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/routes/FlowRoutesTest.kt`

**Interfaces:**
- Consumes: `CordaGateway.regulatoryClear`/`.shipGoods`, `RegulatoryClearRequest`/`ShipGoodsRequest` (Tasks 5, 7)
- Produces: `POST /flows/regulatory-clear`, `POST /flows/ship-goods`

- [ ] **Step 1: Add the failing tests to `FlowRoutesTest.kt`**

Add these two test functions inside the existing `FlowRoutesTest` class (after the
two from Task 7):

```kotlin
    @Test
    fun `POST flows regulatory-clear calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.regulatoryClearResult = FlowResult(linearId = "abc-123", txId = "tx-2", status = "REGULATORY_CLEARED")
        application { module(gateway) }

        val response = client.post("/flows/regulatory-clear") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","complianceOutcome":"CLEAR","documentId":"DOC-2","documentType":"WHO_GMP_CERTIFICATE","onChainHash":"1234"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-2","status":"REGULATORY_CLEARED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "CLEAR", "DOC-2", "WHO_GMP_CERTIFICATE", "1234"), gateway.lastRegulatoryClearArgs)
    }

    @Test
    fun `POST flows ship-goods calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.shipGoodsResult = FlowResult(linearId = "abc-123", txId = "tx-3", status = "SHIPPED")
        application { module(gateway) }

        val response = client.post("/flows/ship-goods") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","documentId":"DOC-3","documentType":"BILL_OF_LADING","onChainHash":"5678"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-3","status":"SHIPPED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-3", "BILL_OF_LADING", "5678"), gateway.lastShipGoodsArgs)
    }
```

Also add the two new imports at the top of the file, alongside the existing
`FlowResult` import:

```kotlin
import com.utfl.blockchainlayer.dto.RegulatoryClearRequest
```

(`ShipGoodsRequest` isn't referenced by name in the test file — the request body
is sent as a raw JSON string — so only the one additional import is needed.)

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
cd CorDapp/blockchain-layer
./gradlew test
```

Expected: FAIL — `404 Not Found` for both new requests (no route registered yet).

- [ ] **Step 3: Add the two routes to `FlowRoutes.kt`**

Add these two route blocks inside `flowRoutes(gateway: CordaGateway)`, after the
existing `/flows/issue-lc` block and before `/flows/regulatory-close`:

```kotlin
    post("/flows/regulatory-clear") {
        val body = call.receive<RegulatoryClearRequest>()
        val result = gateway.regulatoryClear(
            linearId = body.linearId,
            complianceOutcome = body.complianceOutcome,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/ship-goods") {
        val body = call.receive<ShipGoodsRequest>()
        val result = gateway.shipGoods(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }
```

Add the two matching imports at the top of `FlowRoutes.kt`:

```kotlin
import com.utfl.blockchainlayer.dto.RegulatoryClearRequest
import com.utfl.blockchainlayer.dto.ShipGoodsRequest
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
./gradlew test
```

Expected: `BUILD SUCCESSFUL`, 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/kotlin/com/utfl/blockchainlayer/routes/FlowRoutes.kt src/test/kotlin/com/utfl/blockchainlayer/routes/FlowRoutesTest.kt
git commit -m "Add regulatory-clear and ship-goods flow endpoints"
```

---

### Task 9: `accept-docs` and `settle-payment` endpoints (IssuingBank-initiated)

**Files:**
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/routes/FlowRoutes.kt`
- Modify: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/routes/FlowRoutesTest.kt`

**Interfaces:**
- Consumes: `CordaGateway.acceptDocs`/`.settlePayment`, `AcceptDocsRequest`/`SettlePaymentRequest` (Tasks 5, 7)
- Produces: `POST /flows/accept-docs`, `POST /flows/settle-payment`

- [ ] **Step 1: Add the failing tests to `FlowRoutesTest.kt`**

Add these two test functions inside `FlowRoutesTest`:

```kotlin
    @Test
    fun `POST flows accept-docs calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.acceptDocsResult = FlowResult(linearId = "abc-123", txId = "tx-4", status = "ACCEPTED")
        application { module(gateway) }

        val response = client.post("/flows/accept-docs") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"abc-123"}""")
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-4","status":"ACCEPTED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123"), gateway.lastAcceptDocsArgs)
    }

    @Test
    fun `POST flows settle-payment calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.settlePaymentResult = FlowResult(linearId = "abc-123", txId = "tx-5", status = "SETTLED")
        application { module(gateway) }

        val response = client.post("/flows/settle-payment") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","documentId":"DOC-5","documentType":"MT202","onChainHash":"9ABC"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-5","status":"SETTLED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-5", "MT202", "9ABC"), gateway.lastSettlePaymentArgs)
    }
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
cd CorDapp/blockchain-layer
./gradlew test
```

Expected: FAIL — `404 Not Found` for both new requests.

- [ ] **Step 3: Add the two routes to `FlowRoutes.kt`**

Add these two route blocks inside `flowRoutes(gateway: CordaGateway)`, after
`/flows/ship-goods` and before `/flows/regulatory-close`:

```kotlin
    post("/flows/accept-docs") {
        val body = call.receive<AcceptDocsRequest>()
        val result = gateway.acceptDocs(linearId = body.linearId)
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/settle-payment") {
        val body = call.receive<SettlePaymentRequest>()
        val result = gateway.settlePayment(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }
```

Add the two matching imports at the top of `FlowRoutes.kt`:

```kotlin
import com.utfl.blockchainlayer.dto.AcceptDocsRequest
import com.utfl.blockchainlayer.dto.SettlePaymentRequest
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
./gradlew test
```

Expected: `BUILD SUCCESSFUL`, 7 tests passed. All 6 flow endpoints now exist.

- [ ] **Step 5: Commit**

```bash
git add src/main/kotlin/com/utfl/blockchainlayer/routes/FlowRoutes.kt src/test/kotlin/com/utfl/blockchainlayer/routes/FlowRoutesTest.kt
git commit -m "Add accept-docs and settle-payment flow endpoints"
```

---

### Task 10: Read endpoints — `GET /trades/{linearId}` and `GET /trades`

**Files:**
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/routes/TradeRoutes.kt`
- Test: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/routes/TradeRoutesTest.kt`
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/Application.kt`

**Interfaces:**
- Consumes: `CordaGateway.getTrade`/`.listTrades`, `TradeStateDto`,
  `DocumentHashRecordDto`, `TradeNotFoundException` (Task 5), `FakeCordaGateway`
  (Task 5)
- Produces: `GET /trades/{linearId}`, `GET /trades`

- [ ] **Step 1: Write the failing test `TradeRoutesTest.kt`**

Create `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/routes/TradeRoutesTest.kt`:

```kotlin
package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.DocumentHashRecordDto
import com.utfl.blockchainlayer.corda.FakeCordaGateway
import com.utfl.blockchainlayer.corda.TradeStateDto
import com.utfl.blockchainlayer.module
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class TradeRoutesTest {
    private val sampleTrade = TradeStateDto(
        linearId = "abc-123",
        lcReference = "LC-2026-0001",
        importer = "Importer",
        exporter = "Exporter",
        issuingBank = "IssuingBank",
        advisingBank = "AdvisingBank",
        lcTermsHash = "ABCD",
        status = "LC_ISSUED",
        complianceOutcome = null,
        documentHashes = listOf(
            DocumentHashRecordDto(
                documentId = "DOC-1",
                category = "LC_TERMS",
                documentType = "LC_APPLICATION",
                onChainHash = "ABCD",
                milestone = "LC_ISSUED",
                anchoredAt = "2026-01-01T00:00:00Z"
            )
        )
    )

    @Test
    fun `GET trades linearId returns the trade when found`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.tradeToReturn = sampleTrade
        application { module(gateway) }

        val response = client.get("/trades/abc-123")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(
            """{"linearId":"abc-123","lcReference":"LC-2026-0001","importer":"Importer","exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcTermsHash":"ABCD","status":"LC_ISSUED","complianceOutcome":null,"documentHashes":[{"documentId":"DOC-1","category":"LC_TERMS","documentType":"LC_APPLICATION","onChainHash":"ABCD","milestone":"LC_ISSUED","anchoredAt":"2026-01-01T00:00:00Z"}]}""",
            response.bodyAsText()
        )
    }

    @Test
    fun `GET trades linearId returns 404 when not found`() = testApplication {
        val gateway = FakeCordaGateway()
        application { module(gateway) }

        val response = client.get("/trades/does-not-exist")

        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `GET trades returns all trades`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.tradesToReturn = listOf(sampleTrade)
        application { module(gateway) }

        val response = client.get("/trades")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(
            """[{"linearId":"abc-123","lcReference":"LC-2026-0001","importer":"Importer","exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcTermsHash":"ABCD","status":"LC_ISSUED","complianceOutcome":null,"documentHashes":[{"documentId":"DOC-1","category":"LC_TERMS","documentType":"LC_APPLICATION","onChainHash":"ABCD","milestone":"LC_ISSUED","anchoredAt":"2026-01-01T00:00:00Z"}]}]""",
            response.bodyAsText()
        )
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd CorDapp/blockchain-layer
./gradlew test
```

Expected: FAIL — compile error, `TradeStateDto`/`DocumentHashRecordDto` are not
`@Serializable` yet (they're plain data classes in `corda/CordaGateway.kt` from
Task 5), so Ktor's content negotiation can't encode them as a route response.

- [ ] **Step 3: Make `TradeStateDto` and `DocumentHashRecordDto` serializable**

Open `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/CordaGateway.kt`
and add `kotlinx.serialization.Serializable` annotations to both data classes (and
the import):

```kotlin
package com.utfl.blockchainlayer.corda

import kotlinx.serialization.Serializable

data class FlowResult(
    val linearId: String,
    val txId: String,
    val status: String
)

@Serializable
data class DocumentHashRecordDto(
    val documentId: String,
    val category: String,
    val documentType: String,
    val onChainHash: String,
    val milestone: String,
    val anchoredAt: String
)

@Serializable
data class TradeStateDto(
    val linearId: String,
    val lcReference: String,
    val importer: String,
    val exporter: String,
    val issuingBank: String,
    val advisingBank: String,
    val lcTermsHash: String,
    val status: String,
    val complianceOutcome: String?,
    val documentHashes: List<DocumentHashRecordDto>
)
```

(`FlowResult` stays a plain data class — it's never returned directly, always
mapped through `FlowResultResponse` in `FlowRoutes.kt`, which is already
`@Serializable`.)

- [ ] **Step 4: Write `TradeRoutes.kt`**

Create `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/routes/TradeRoutes.kt`:

```kotlin
package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.CordaGateway
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

fun Route.tradeRoutes(gateway: CordaGateway) {
    get("/trades/{linearId}") {
        val linearId = call.parameters["linearId"]!!
        val trade = gateway.getTrade(linearId)
        call.respond(HttpStatusCode.OK, trade)
    }

    get("/trades") {
        call.respond(HttpStatusCode.OK, gateway.listTrades())
    }
}
```

- [ ] **Step 5: Wire `tradeRoutes` into `Application.kt`**

In `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/Application.kt`,
add the import and the call, so the `routing { }` block reads:

```kotlin
import com.utfl.blockchainlayer.routes.tradeRoutes
```

```kotlin
    routing {
        get("/health") {
            call.respondText("""{"status":"ok"}""", io.ktor.http.ContentType.Application.Json)
        }
        flowRoutes(gateway)
        tradeRoutes(gateway)
    }
```

- [ ] **Step 6: Run the tests — expect the 404 case to still fail**

```bash
./gradlew test
```

Expected: 2 of the 3 new tests pass; `GET trades linearId returns 404 when not
found` FAILS because nothing yet maps `TradeNotFoundException` to a 404 — Ktor's
default behavior for an uncaught exception is a 500. This is expected and gets
fixed in Task 11 (error handling). Confirm the failure looks like a 500, not
something else, before moving on.

- [ ] **Step 7: Commit**

```bash
git add src/main/kotlin/com/utfl/blockchainlayer/corda/CordaGateway.kt src/main/kotlin/com/utfl/blockchainlayer/routes/TradeRoutes.kt src/main/kotlin/com/utfl/blockchainlayer/Application.kt src/test/kotlin/com/utfl/blockchainlayer/routes/TradeRoutesTest.kt
git commit -m "Add GET /trades and GET /trades/{linearId} read endpoints"
```

(The 404 test stays red across this commit — that's expected and called out
explicitly above; Task 11 turns it green. Don't skip or delete the test to make the
suite pass early.)

---

### Task 11: Error handling — map Corda/gateway failures to HTTP status codes

**Files:**
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/dto/ErrorResponse.kt`
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/Application.kt`
- Test: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/ErrorHandlingTest.kt`

**Interfaces:**
- Consumes: `TradeNotFoundException`, `FlowRejectedException`,
  `CordaConnectionException` (Task 5), `FakeCordaGateway` (Task 5)
- Produces: consistent `{ "error": "..." }` JSON body on failure; closes out the
  spec's error-mapping table (`400`/`404`/`502`).

- [ ] **Step 1: Write the failing test `ErrorHandlingTest.kt`**

Create `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/ErrorHandlingTest.kt`:

```kotlin
package com.utfl.blockchainlayer

import com.utfl.blockchainlayer.corda.CordaConnectionException
import com.utfl.blockchainlayer.corda.FakeCordaGateway
import com.utfl.blockchainlayer.corda.FlowRejectedException
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class ErrorHandlingTest {
    @Test
    fun `unknown linearId returns 404 with an error body`() = testApplication {
        val gateway = FakeCordaGateway()
        application { module(gateway) }

        val response = client.get("/trades/does-not-exist")

        assertEquals(HttpStatusCode.NotFound, response.status)
        assertEquals("""{"error":"No trade found with linearId=does-not-exist"}""", response.bodyAsText())
    }

    @Test
    fun `a rejected flow returns 400 with an error body`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.issueLCError = FlowRejectedException("Contract verification failed: bad input")
        application { module(gateway) }

        val response = client.post("/flows/issue-lc") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-1","lcTermsDocumentId":"DOC-1","lcTermsHash":"ABCD"}"""
            )
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals("""{"error":"Contract verification failed: bad input"}""", response.bodyAsText())
    }

    @Test
    fun `an RPC connection failure returns 502 with an error body`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.issueLCError = CordaConnectionException("Could not connect to Corda RPC at localhost:10006")
        application { module(gateway) }

        val response = client.post("/flows/issue-lc") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-1","lcTermsDocumentId":"DOC-1","lcTermsHash":"ABCD"}"""
            )
        }

        assertEquals(HttpStatusCode.BadGateway, response.status)
        assertEquals("""{"error":"Could not connect to Corda RPC at localhost:10006"}""", response.bodyAsText())
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd CorDapp/blockchain-layer
./gradlew test
```

Expected: all 3 FAIL (currently every uncaught exception produces a bare 500 with
no JSON body), along with the still-red 404 test from Task 10.

- [ ] **Step 3: Write `ErrorResponse.kt`**

Create `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/dto/ErrorResponse.kt`:

```kotlin
package com.utfl.blockchainlayer.dto

import kotlinx.serialization.Serializable

@Serializable
data class ErrorResponse(val error: String)
```

- [ ] **Step 4: Install `StatusPages` in `Application.kt`**

In `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/Application.kt`,
add the imports:

```kotlin
import com.utfl.blockchainlayer.corda.CordaConnectionException
import com.utfl.blockchainlayer.corda.FlowRejectedException
import com.utfl.blockchainlayer.corda.TradeNotFoundException
import com.utfl.blockchainlayer.dto.ErrorResponse
import io.ktor.server.plugins.statuspages.StatusPages
```

and, inside `fun Application.module(gateway: CordaGateway) { ... }`, add a second
`install` block right after the existing `install(ContentNegotiation) { ... }`:

```kotlin
    install(StatusPages) {
        exception<TradeNotFoundException> { call, cause ->
            call.respond(HttpStatusCode.NotFound, ErrorResponse(cause.message ?: "Not found"))
        }
        exception<FlowRejectedException> { call, cause ->
            call.respond(HttpStatusCode.BadRequest, ErrorResponse(cause.message ?: "Flow rejected"))
        }
        exception<CordaConnectionException> { call, cause ->
            call.respond(HttpStatusCode.BadGateway, ErrorResponse(cause.message ?: "Corda connection failed"))
        }
    }
```

Add the matching `import io.ktor.http.HttpStatusCode` and
`import io.ktor.server.response.respond` if they aren't already present from
earlier tasks (check the file first — `HttpStatusCode` is likely already imported
via the `get("/health")` block's `io.ktor.http.ContentType` fully-qualified
reference, but `HttpStatusCode` itself and `respond` need their own imports here).

- [ ] **Step 5: Run the tests to verify they pass**

```bash
./gradlew test
```

Expected: `BUILD SUCCESSFUL`, all tests pass — including Task 10's previously-red
404 test.

- [ ] **Step 6: Commit**

```bash
git add src/main/kotlin/com/utfl/blockchainlayer/dto/ErrorResponse.kt src/main/kotlin/com/utfl/blockchainlayer/Application.kt src/test/kotlin/com/utfl/blockchainlayer/ErrorHandlingTest.kt
git commit -m "Map Corda/gateway failures to HTTP error responses"
```

---

### Task 12: Dockerize `blockchain-layer` and add it to Docker Compose

**Files:**
- Create: `CorDapp/blockchain-layer/Dockerfile`
- Modify: `CorDapp/docker/docker-compose.yml`

**Interfaces:**
- Consumes: `CorDapp/blockchain-layer`'s shadow jar (Task 4's `shadowJar` task)
- Produces: `blockchain-layer` running as a container on the same
  `corda-network`, reachable at `localhost:8081` from the host — consumed by
  Task 13's integration test.

- [ ] **Step 1: Write `CorDapp/blockchain-layer/Dockerfile`**

```dockerfile
FROM eclipse-temurin:17-jre

WORKDIR /app

COPY build/libs/blockchain-layer-0.1.jar /app/blockchain-layer.jar

EXPOSE 8081

ENTRYPOINT ["java", "-jar", "/app/blockchain-layer.jar"]
```

- [ ] **Step 2: Build the shadow jar and verify it runs standalone**

```bash
cd CorDapp/blockchain-layer
./gradlew shadowJar
ls build/libs
```

Expected: `build/libs/blockchain-layer-0.1.jar` exists (matching the
`archiveBaseName`/`version` from Task 4's `shadowJar { }` config).

- [ ] **Step 3: Add `blockchain-layer` as a service in `docker-compose.yml`**

In `CorDapp/docker/docker-compose.yml`, add this service (alongside the 5 existing
ones from Task 3):

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
    networks:
      - corda-network
    depends_on:
      - importer-node
      - exporter-node
      - issuingbank-node
      - advisingbank-node
```

`blockchain-layer` connects to the nodes by their compose service names
(`importer-node`, etc.) rather than `localhost`, since it's joining the same
`corda-network` — `RpcConfigLoader.fromEnv()` (Task 6) already reads
`IMPORTER_RPC_HOST` etc. from the environment, defaulting to `localhost` only when
unset (i.e. when running `blockchain-layer` directly on the host against
Task 3's host-published ports, for local dev without Docker).

- [ ] **Step 4: Bring the whole stack up and verify**

```bash
cd docker
docker compose up -d --build
docker compose ps
curl http://localhost:8081/health
```

Expected: all 6 containers `running`; `curl` returns `{"status":"ok"}`.

- [ ] **Step 5: Tear down**

```bash
docker compose down
```

- [ ] **Step 6: Commit**

```bash
git add blockchain-layer/Dockerfile docker/docker-compose.yml
git commit -m "Dockerize blockchain-layer and add it to the Compose network"
```

---

### Task 13: Full-lifecycle Docker integration test

**Files:**
- Create: `CorDapp/blockchain-layer/src/integrationTest/kotlin/com/utfl/blockchainlayer/FullLifecycleIT.kt`
- Create: `CorDapp/blockchain-layer/scripts/run-integration-tests.sh`
- Modify: `CorDapp/blockchain-layer/build.gradle`

**Interfaces:**
- Consumes: the running Docker Compose stack from Task 12 (all 6 flow endpoints +
  2 read endpoints)
- Produces: `./gradlew integrationTest` (a separate Gradle source set/task from
  `test`), and `scripts/run-integration-tests.sh` as the one command that starts
  the network, runs it, and tears down — this is the task that actually proves
  Tasks 1-12 work together against real RPC, not fakes.

- [ ] **Step 1: Add an `integrationTest` source set to `build.gradle`**

Append this to the end of `CorDapp/blockchain-layer/build.gradle`:

```groovy
sourceSets {
    integrationTest {
        kotlin {
            srcDirs = ['src/integrationTest/kotlin']
        }
        compileClasspath += sourceSets.main.output + sourceSets.test.output
        runtimeClasspath += sourceSets.main.output + sourceSets.test.output
    }
}

configurations {
    integrationTestImplementation.extendsFrom testImplementation
    integrationTestRuntimeOnly.extendsFrom testRuntimeOnly
}

dependencies {
    integrationTestImplementation "io.ktor:ktor-client-core-jvm:$ktor_version"
    integrationTestImplementation "io.ktor:ktor-client-cio-jvm:$ktor_version"
    integrationTestImplementation "io.ktor:ktor-client-content-negotiation-jvm:$ktor_version"
}

task integrationTest(type: Test) {
    description = 'Runs integration tests against a live Docker Compose network'
    group = 'verification'
    testClassesDirs = sourceSets.integrationTest.output.classesDirs
    classpath = sourceSets.integrationTest.runtimeClasspath
    useJUnitPlatform()
    shouldRunAfter test
}
```

- [ ] **Step 2: Write `FullLifecycleIT.kt`**

Create `CorDapp/blockchain-layer/src/integrationTest/kotlin/com/utfl/blockchainlayer/FullLifecycleIT.kt`:

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
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlin.test.Test
import kotlin.test.assertEquals

@Serializable
private data class FlowResultBody(val linearId: String, val txId: String, val status: String)

class FullLifecycleIT {
    private val baseUrl = System.getenv("BLOCKCHAIN_LAYER_URL") ?: "http://localhost:8081"
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json() }
    }

    @Test
    fun `one trade moves through all six milestones via the real REST API`() = runBlocking {
        val issueResponse: HttpResponse = client.post("$baseUrl/flows/issue-lc") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-IT-0001","lcTermsDocumentId":"DOC-1","lcTermsHash":"${sampleHash()}"}"""
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

        val acceptResponse = client.post("$baseUrl/flows/accept-docs") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"$linearId"}""")
        }
        assertEquals("ACCEPTED", acceptResponse.body<FlowResultBody>().status)

        val settleResponse = client.post("$baseUrl/flows/settle-payment") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","documentId":"DOC-5","documentType":"MT202","onChainHash":"${sampleHash()}"}"""
            )
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
    }

    private fun sampleHash(): String {
        // A syntactically valid SHA-256 hex string (Corda's SecureHash.parse requires 64 hex chars).
        return (1..64).joinToString("") { "A" }
    }
}
```

- [ ] **Step 3: Write `scripts/run-integration-tests.sh`**

Create `CorDapp/blockchain-layer/scripts/run-integration-tests.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../../docker"

echo "Starting Docker Compose network..."
docker compose up -d --build --wait

echo "Running integration tests..."
cd ../blockchain-layer
./gradlew integrationTest
TEST_EXIT_CODE=$?

echo "Tearing down Docker Compose network..."
cd ../docker
docker compose down

exit $TEST_EXIT_CODE
```

Make it executable:

```bash
chmod +x CorDapp/blockchain-layer/scripts/run-integration-tests.sh
```

- [ ] **Step 4: Run it**

```bash
./CorDapp/blockchain-layer/scripts/run-integration-tests.sh
```

Expected: the Compose network comes up, `integrationTest` reports `BUILD
SUCCESSFUL` with 1 test passed (the full 6-milestone lifecycle driven entirely
through real HTTP calls against real Corda RPC), then the network tears down and
the script exits `0`.

- [ ] **Step 5: Commit**

```bash
git add build.gradle src/integrationTest/kotlin/com/utfl/blockchainlayer/FullLifecycleIT.kt scripts/run-integration-tests.sh
git commit -m "Add Docker-based full-lifecycle integration test"
```

---

### Task 14: README

**Files:**
- Create: `CorDapp/blockchain-layer/README.md`

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by other tasks — documentation only, and the final
  task of this plan.

- [ ] **Step 1: Write `README.md`**

Create `CorDapp/blockchain-layer/README.md`:

```markdown
# blockchain-layer

A Kotlin/Ktor bridge service exposing the UTFL trade-finance CorDapp's 6 milestone
flows as a REST API, backed by a real, Docker-deployed 4-party + notary Corda
network — not `MockNetwork`. See
`docs/superpowers/specs/2026-07-27-blockchain-layer-design.md` for the design.

This is a standalone service in this phase: nothing in `api` or `web` calls it yet.
It's exercised directly via its own REST API and integration tests.

## Requirements

- JDK 8 (to run the Corda nodes) **and** JDK 17 (to run `blockchain-layer` itself)
  both installed — they're separate JVM processes.
- Docker + Docker Compose.
- The `contracts` and `workflows` modules published to Maven local (see below).

## One-time setup: publish contracts/workflows and generate the node network

From `CorDapp/` (JDK 8):

```bash
./gradlew :contracts:publishToMavenLocal :workflows:publishToMavenLocal
./gradlew deployNodes
```

## Run the full stack

```bash
cd CorDapp/docker
docker compose up -d --build
curl http://localhost:8081/health
```

## Example: drive one trade through the full lifecycle

```bash
curl -X POST http://localhost:8081/flows/issue-lc \
  -H 'Content-Type: application/json' \
  -d '{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-2026-0001","lcTermsDocumentId":"DOC-1","lcTermsHash":"<64-hex-char-sha256>"}'
# => {"linearId":"...","txId":"...","status":"LC_ISSUED"}

curl http://localhost:8081/trades/<linearId>
```

Each of the other 5 milestones follows the same shape — see
`src/main/kotlin/com/utfl/blockchainlayer/dto/FlowDtos.kt` for every endpoint's
exact request body.

## Build and test

```bash
cd CorDapp/blockchain-layer
./gradlew test              # fast, no Docker needed (uses FakeCordaGateway)
./scripts/run-integration-tests.sh   # starts Docker Compose, runs the real lifecycle, tears down
```

## Module layout

- `corda/` — `CordaGateway` interface, `RealCordaGateway` (RPC-backed), the 4
  fixed RPC connections (`RpcConnections`).
- `routes/` — Ktor route handlers, one file per concern (`FlowRoutes.kt` for the 6
  milestone endpoints, `TradeRoutes.kt` for the 2 read endpoints).
- `dto/` — `@Serializable` request/response bodies.

## Not in scope for this service (see the design spec)

- Wiring `api`/`web` to call this service.
- Dynamic org-to-Corda-party mapping.
- Authentication between services.
- Async/queued flow invocation.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add blockchain-layer README"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** Architecture/deployment (Tasks 1-3, 12), REST API shape
  (Tasks 7-10), error handling (Task 11), testing tiers (Tasks 5/7-10 for unit,
  Task 13 for integration), explicit non-goals (carried into the README, Task 14)
  — all covered.
- **Type consistency:** `FlowResult`/`TradeStateDto`/`DocumentHashRecordDto`
  (Task 5) are used identically by `RealCordaGateway` (Task 6), `FakeCordaGateway`
  (Task 5), and every route (Tasks 7-10) — verified no field renames across tasks.
  `CordaGateway`'s method signatures (Task 5) match exactly what `FlowRoutes.kt`
  (Tasks 7-9) and `TradeRoutes.kt` (Task 10) call.
- **Task 2's Gradle draft:** deliberately includes a self-correcting step (Step 3
  removes a dead line from Step 2) rather than a clean first draft — flagged
  in-line since `Cordform`'s DSL is easy to get subtly wrong and this plan hasn't
  been run yet; an implementer hitting a different Cordform error than the one
  anticipated should treat it as a real finding to fix, not a sign they misread the
  step.
