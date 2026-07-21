# Trade Finance CorDapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Corda 4.x/Kotlin CorDapp that implements the letter-of-credit trade finance milestone lifecycle (`TradeFinanceState`, `TradeFinanceContract`, six milestone flows) as specified in `docs/superpowers/specs/2026-07-21-corda-trade-finance-cordapp-design.md`, validated entirely through automated `MockNetwork`/ledger-DSL tests.

**Architecture:** A two-module Gradle project (`contracts`, `workflows`) following R3's standard Corda 4 layout. `contracts` holds `TradeFinanceState`, its enums/value types, and `TradeFinanceContract` (the milestone state machine). `workflows` holds six `Initiator`/`Responder` flow pairs — one per milestone — sharing a generic `AbstractTradeFinanceResponder` and a vault-lookup helper.

**Tech Stack:** Corda 4.10 (open source), Kotlin 1.2.71, Gradle 5.6.4 (via wrapper), JUnit 4, Corda `MockNetwork` + ledger DSL for testing. No real node deployment, no portal, no other platform services — this project is exactly the scope of the linked spec.

## Global Constraints

- Corda version: **4.10** (`net.corda:corda-core:4.10`, platform version 12) — exact values are in `constants.properties`, written once in Task 1 and never hand-edited again.
- Kotlin: **1.2.71**, language/API version "1.2", `jvmTarget = "1.8"` — matches Corda 4.10's supported toolchain.
- **JDK 8 is required** (not 11+) to build and run — this is a hard Corda 4.x constraint, not a project choice. If `./gradlew build` fails with class-file version errors, the fix is installing/selecting a JDK 8 and pointing `JAVA_HOME` at it — not changing the Kotlin/Corda versions.
- Base package: `com.utfl.tradefinance` for the `contracts` module, `com.utfl.tradefinance.flows` for the `workflows` module.
- No off-chain fields (uploader identity, storage references, verification-status detail) may be added to `DocumentHashRecord` or `TradeFinanceState` — this is the on-chain/off-chain boundary from the spec, enforced by never adding such a field, in every task.
- Every contract/flow test must run via `./gradlew :contracts:test` or `./gradlew :workflows:test` — no manual/interactive verification steps.
- Frequent commits: one commit per task, after its tests pass.

---

## File Structure

```
build.gradle                  # root: buildscript + allprojects Kotlin config (no deployNodes)
settings.gradle                # includes 'contracts', 'workflows'
gradle.properties              # project name/group/version
constants.properties           # pinned Corda/Kotlin/Gradle-plugin versions
repositories.gradle            # shared Maven repo list
gradlew, gradlew.bat, gradle/wrapper/*   # Gradle wrapper (downloaded from R3's official template)

contracts/build.gradle
contracts/src/main/kotlin/com/utfl/tradefinance/
  TradeMilestoneStatus.kt      # enum: the 6-milestone sequence
  ComplianceOutcome.kt         # enum: CLEAR/REVIEW/BLOCK
  DocumentHashRecord.kt        # embedded anchor record (no off-chain fields)
  TradeFinanceState.kt         # the LinearState
  TradeFinanceContract.kt      # the milestone state machine
contracts/src/test/kotlin/com/utfl/tradefinance/
  TradeFinanceTypesTest.kt
  TradeFinanceStateTest.kt
  TradeFinanceContractTest.kt  # grows across Tasks 4-7

workflows/build.gradle
workflows/src/main/kotlin/com/utfl/tradefinance/flows/
  FlowSupport.kt                # AbstractTradeFinanceResponder + fetchUnconsumedTradeState
  IssueLCFlow.kt
  RegulatoryClearFlow.kt
  ShipGoodsFlow.kt
  AcceptDocsFlow.kt
  SettlePaymentFlow.kt
  RegulatoryCloseFlow.kt
workflows/src/test/kotlin/com/utfl/tradefinance/flows/
  AbstractFlowTest.kt           # shared 4-node + notary MockNetwork setup
  IssueLCFlowTest.kt
  RegulatoryClearAndShipGoodsFlowTest.kt
  RemainingMilestonesFlowTest.kt
  FullLifecycleFlowTest.kt

README.md
```

---

### Task 1: Gradle project scaffold

**Files:**
- Create: `build.gradle`, `settings.gradle`, `gradle.properties`, `constants.properties`, `repositories.gradle`
- Create: `contracts/build.gradle`, `workflows/build.gradle`
- Create (downloaded): `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`, `gradle/wrapper/gradle-wrapper.properties`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a buildable two-module Gradle project (`:contracts`, `:workflows`) that later tasks add Kotlin sources to. `corda_release_group`, `corda_core_release_group`, `corda_release_version`, `corda_core_release_version`, `corda_gradle_plugins_version`, `kotlin_version`, `junit_version`, `quasar_version`, `log4j_version`, `slf4j_version`, `corda_platform_version` are all available as Gradle `ext` properties to every subproject.

- [ ] **Step 1: Write `constants.properties`**

```properties
cordaReleaseGroup=net.corda
cordaCoreReleaseGroup=net.corda
cordaVersion=4.10
cordaCoreVersion=4.10
gradlePluginsVersion=5.0.12
kotlinVersion=1.2.71
junitVersion=4.12
quasarVersion=0.7.13_r3
log4jVersion=2.17.1
platformVersion=12
slf4jVersion=1.7.25
```

- [ ] **Step 2: Write `repositories.gradle`**

```gradle
repositories {
    mavenLocal()
    mavenCentral()
    maven { url 'https://jitpack.io' }
    maven { url 'https://download.corda.net/maven/corda-dependencies' }
    maven { url 'https://download.corda.net/maven/corda-releases' }
}
```

- [ ] **Step 3: Write root `build.gradle`**

```gradle
buildscript {
    Properties constants = new Properties()
    file("$projectDir/constants.properties").withInputStream { constants.load(it) }

    ext {
        corda_release_group = constants.getProperty("cordaReleaseGroup")
        corda_core_release_group = constants.getProperty("cordaCoreReleaseGroup")
        corda_release_version = constants.getProperty("cordaVersion")
        corda_core_release_version = constants.getProperty("cordaCoreVersion")
        corda_gradle_plugins_version = constants.getProperty("gradlePluginsVersion")
        kotlin_version = constants.getProperty("kotlinVersion")
        junit_version = constants.getProperty("junitVersion")
        quasar_version = constants.getProperty("quasarVersion")
        log4j_version = constants.getProperty("log4jVersion")
        slf4j_version = constants.getProperty("slf4jVersion")
        corda_platform_version = constants.getProperty("platformVersion").toInteger()
    }

    repositories {
        mavenLocal()
        mavenCentral()
        maven { url 'https://download.corda.net/maven/corda-releases' }
    }

    dependencies {
        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
        classpath "net.corda.plugins:cordapp:$corda_gradle_plugins_version"
        classpath "net.corda.plugins:quasar-utils:$corda_gradle_plugins_version"
    }
}

allprojects {
    apply from: "${rootProject.projectDir}/repositories.gradle"
    apply plugin: 'kotlin'

    repositories {
        mavenLocal()
        mavenCentral()
        maven { url 'https://download.corda.net/maven/corda-dependencies' }
        maven { url 'https://download.corda.net/maven/corda-releases' }
        maven { url 'https://jitpack.io' }
    }

    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile) {
        kotlinOptions {
            languageVersion = "1.2"
            apiVersion = "1.2"
            jvmTarget = "1.8"
            javaParameters = true
        }
    }

    jar {
        preserveFileTimestamps = false
        reproducibleFileOrder = true
    }
}
```

- [ ] **Step 4: Write `settings.gradle`**

```gradle
rootProject.name = 'utfl-trade-finance-cordapp'
include 'contracts'
include 'workflows'
```

- [ ] **Step 5: Write `gradle.properties`**

```properties
name=UTFL Trade Finance CorDapp
group=com.utfl.tradefinance
version=0.1
kotlin.incremental=false
```

- [ ] **Step 6: Write `contracts/build.gradle`**

```gradle
apply plugin: 'net.corda.plugins.cordapp'

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
```

- [ ] **Step 7: Write `workflows/build.gradle`**

```gradle
apply plugin: 'net.corda.plugins.cordapp'
apply plugin: 'net.corda.plugins.quasar-utils'

cordapp {
    targetPlatformVersion corda_platform_version
    minimumPlatformVersion corda_platform_version
    workflow {
        name "UTFL Trade Finance Flows"
        vendor "UTFL"
        licence "Apache License, Version 2.0"
        versionId 1
    }
}

dependencies {
    compile "org.jetbrains.kotlin:kotlin-stdlib-jdk8:$kotlin_version"
    testCompile "org.jetbrains.kotlin:kotlin-test:$kotlin_version"
    testCompile "junit:junit:$junit_version"

    cordaCompile "$corda_core_release_group:corda-core:$corda_core_release_version"
    cordaRuntime "$corda_release_group:corda:$corda_release_version"
    testCompile "$corda_release_group:corda-node-driver:$corda_release_version"

    cordapp project(":contracts")
}
```

- [ ] **Step 8: Download the Gradle wrapper (pinned to Gradle 5.6.4, matching `corda-gradle-plugins:5.0.12`)**

```bash
mkdir -p gradle/wrapper
curl -s -o gradlew "https://raw.githubusercontent.com/corda/cordapp-template-kotlin/release-V4/gradlew"
curl -s -o gradlew.bat "https://raw.githubusercontent.com/corda/cordapp-template-kotlin/release-V4/gradlew.bat"
curl -s -o gradle/wrapper/gradle-wrapper.jar "https://raw.githubusercontent.com/corda/cordapp-template-kotlin/release-V4/gradle/wrapper/gradle-wrapper.jar"
curl -s -o gradle/wrapper/gradle-wrapper.properties "https://raw.githubusercontent.com/corda/cordapp-template-kotlin/release-V4/gradle/wrapper/gradle-wrapper.properties"
chmod +x gradlew
```

- [ ] **Step 9: Verify the empty project builds**

Run: `./gradlew build`
Expected: `BUILD SUCCESSFUL` (both `contracts` and `workflows` compile with zero sources — this only proves the Gradle/Corda/Kotlin toolchain resolves correctly). First run downloads Gradle 5.6.4 and all Corda dependencies, so allow several minutes and a working internet connection.

If it fails with a class-file/JDK version error, install JDK 8 and re-run with `JAVA_HOME` pointed at it — do not change the pinned versions in `constants.properties` to work around this.

- [ ] **Step 10: Commit**

```bash
git add build.gradle settings.gradle gradle.properties constants.properties repositories.gradle contracts/build.gradle workflows/build.gradle gradlew gradlew.bat gradle/wrapper
git commit -m "Scaffold two-module Corda 4.10 Gradle project"
```

---

### Task 2: Milestone/compliance enums and the document-hash record

**Files:**
- Create: `contracts/src/main/kotlin/com/utfl/tradefinance/TradeMilestoneStatus.kt`
- Create: `contracts/src/main/kotlin/com/utfl/tradefinance/ComplianceOutcome.kt`
- Create: `contracts/src/main/kotlin/com/utfl/tradefinance/DocumentHashRecord.kt`
- Test: `contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceTypesTest.kt`

**Interfaces:**
- Consumes: nothing new (uses only Corda core types: `SecureHash`, `CordaSerializable`)
- Produces: `TradeMilestoneStatus` enum (`LC_ISSUED, REGULATORY_CLEARED, SHIPPED, ACCEPTED, SETTLED, CLOSED`), `ComplianceOutcome` enum (`CLEAR, REVIEW, BLOCK`), `DocumentHashRecord(documentId: String, category: String, documentType: String, onChainHash: SecureHash, milestone: TradeMilestoneStatus, anchoredAt: Instant)` — all consumed by `TradeFinanceState` (Task 3) and `TradeFinanceContract` (Tasks 4-7).

- [ ] **Step 1: Write the failing test**

```kotlin
package com.utfl.tradefinance

import net.corda.core.crypto.SecureHash
import org.junit.Test
import java.time.Instant
import kotlin.test.assertEquals

class TradeFinanceTypesTest {
    @Test
    fun `TradeMilestoneStatus has the six expected milestones in order`() {
        assertEquals(
            listOf(
                TradeMilestoneStatus.LC_ISSUED,
                TradeMilestoneStatus.REGULATORY_CLEARED,
                TradeMilestoneStatus.SHIPPED,
                TradeMilestoneStatus.ACCEPTED,
                TradeMilestoneStatus.SETTLED,
                TradeMilestoneStatus.CLOSED
            ),
            TradeMilestoneStatus.values().toList()
        )
    }

    @Test
    fun `ComplianceOutcome has CLEAR REVIEW and BLOCK`() {
        assertEquals(
            listOf(ComplianceOutcome.CLEAR, ComplianceOutcome.REVIEW, ComplianceOutcome.BLOCK),
            ComplianceOutcome.values().toList()
        )
    }

    @Test
    fun `DocumentHashRecord holds only the anchored fields`() {
        val hash = SecureHash.randomSHA256()
        val now = Instant.now()
        val record = DocumentHashRecord(
            documentId = "DOC-1",
            category = "LC_TERMS",
            documentType = "LC_APPLICATION",
            onChainHash = hash,
            milestone = TradeMilestoneStatus.LC_ISSUED,
            anchoredAt = now
        )
        assertEquals("DOC-1", record.documentId)
        assertEquals(hash, record.onChainHash)
        assertEquals(TradeMilestoneStatus.LC_ISSUED, record.milestone)
        assertEquals(now, record.anchoredAt)
    }
}
```

- [ ] **Step 2: Run test to verify it fails (compile error — types don't exist yet)**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceTypesTest"`
Expected: FAIL — compilation error, `TradeMilestoneStatus`/`ComplianceOutcome`/`DocumentHashRecord` unresolved.

- [ ] **Step 3: Write `TradeMilestoneStatus.kt`**

```kotlin
package com.utfl.tradefinance

enum class TradeMilestoneStatus {
    LC_ISSUED,
    REGULATORY_CLEARED,
    SHIPPED,
    ACCEPTED,
    SETTLED,
    CLOSED
}
```

- [ ] **Step 4: Write `ComplianceOutcome.kt`**

```kotlin
package com.utfl.tradefinance

enum class ComplianceOutcome {
    CLEAR,
    REVIEW,
    BLOCK
}
```

- [ ] **Step 5: Write `DocumentHashRecord.kt`**

```kotlin
package com.utfl.tradefinance

import net.corda.core.crypto.SecureHash
import net.corda.core.serialization.CordaSerializable
import java.time.Instant

@CordaSerializable
data class DocumentHashRecord(
    val documentId: String,
    val category: String,
    val documentType: String,
    val onChainHash: SecureHash,
    val milestone: TradeMilestoneStatus,
    val anchoredAt: Instant
)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceTypesTest"`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add contracts/src/main/kotlin/com/utfl/tradefinance/TradeMilestoneStatus.kt contracts/src/main/kotlin/com/utfl/tradefinance/ComplianceOutcome.kt contracts/src/main/kotlin/com/utfl/tradefinance/DocumentHashRecord.kt contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceTypesTest.kt
git commit -m "Add milestone/compliance enums and DocumentHashRecord"
```

---

### Task 3: TradeFinanceState

**Files:**
- Create: `contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceContract.kt` (empty placeholder contract class, needed because `TradeFinanceState` references it via `@BelongsToContract`)
- Create: `contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceState.kt`
- Test: `contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceStateTest.kt`

**Interfaces:**
- Consumes: `TradeMilestoneStatus`, `ComplianceOutcome`, `DocumentHashRecord` (Task 2)
- Produces: `TradeFinanceState(lcReference: String, importer: Party, exporter: Party, issuingBank: Party, advisingBank: Party, lcTermsHash: SecureHash, status: TradeMilestoneStatus, complianceOutcome: ComplianceOutcome? = null, documentHashes: List<DocumentHashRecord> = emptyList(), linearId: UniqueIdentifier = UniqueIdentifier())` — a `LinearState` with `participants = [importer, exporter, issuingBank, advisingBank]`. `TradeFinanceContract.ID = "com.utfl.tradefinance.TradeFinanceContract"` (used by every flow from Task 8 onward).

- [ ] **Step 1: Write the failing test**

```kotlin
package com.utfl.tradefinance

import net.corda.core.crypto.SecureHash
import net.corda.core.identity.CordaX500Name
import net.corda.testing.core.TestIdentity
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TradeFinanceStateTest {
    private val importer = TestIdentity(CordaX500Name("Importer", "Mumbai", "IN")).party
    private val exporter = TestIdentity(CordaX500Name("Exporter", "Mumbai", "IN")).party
    private val issuingBank = TestIdentity(CordaX500Name("IssuingBank", "Tokyo", "JP")).party
    private val advisingBank = TestIdentity(CordaX500Name("AdvisingBank", "Mumbai", "IN")).party

    private fun newState() = TradeFinanceState(
        lcReference = "LC-2026-0001",
        importer = importer,
        exporter = exporter,
        issuingBank = issuingBank,
        advisingBank = advisingBank,
        lcTermsHash = SecureHash.randomSHA256(),
        status = TradeMilestoneStatus.LC_ISSUED
    )

    @Test
    fun `participants includes all four parties`() {
        val state = newState()
        assertEquals(4, state.participants.size)
        assertTrue(state.participants.containsAll(listOf(importer, exporter, issuingBank, advisingBank)))
    }

    @Test
    fun `document hashes default to empty and compliance outcome defaults to null`() {
        val state = newState()
        assertTrue(state.documentHashes.isEmpty())
        assertNull(state.complianceOutcome)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceStateTest"`
Expected: FAIL — `TradeFinanceState` unresolved.

- [ ] **Step 3: Write a placeholder `TradeFinanceContract.kt`** (filled in properly in Task 4; it must exist now only so `TradeFinanceState` can reference it)

```kotlin
package com.utfl.tradefinance

import net.corda.core.contracts.Contract
import net.corda.core.transactions.LedgerTransaction

class TradeFinanceContract : Contract {
    companion object {
        const val ID = "com.utfl.tradefinance.TradeFinanceContract"
    }

    override fun verify(tx: LedgerTransaction) {
        throw NotImplementedError("Implemented in Task 4")
    }
}
```

- [ ] **Step 4: Write `TradeFinanceState.kt`**

```kotlin
package com.utfl.tradefinance

import net.corda.core.contracts.BelongsToContract
import net.corda.core.contracts.LinearState
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.identity.AbstractParty
import net.corda.core.identity.Party

@BelongsToContract(TradeFinanceContract::class)
data class TradeFinanceState(
    val lcReference: String,
    val importer: Party,
    val exporter: Party,
    val issuingBank: Party,
    val advisingBank: Party,
    val lcTermsHash: SecureHash,
    val status: TradeMilestoneStatus,
    val complianceOutcome: ComplianceOutcome? = null,
    val documentHashes: List<DocumentHashRecord> = emptyList(),
    override val linearId: UniqueIdentifier = UniqueIdentifier()
) : LinearState {
    override val participants: List<AbstractParty>
        get() = listOf(importer, exporter, issuingBank, advisingBank)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceStateTest"`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceContract.kt contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceState.kt contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceStateTest.kt
git commit -m "Add TradeFinanceState"
```

---

### Task 4: TradeFinanceContract — IssueLC

**Files:**
- Modify: `contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceContract.kt`
- Create: `contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceContractTest.kt`

**Interfaces:**
- Consumes: `TradeFinanceState`, `TradeMilestoneStatus`, `DocumentHashRecord` (Tasks 2-3)
- Produces: `TradeFinanceContract.Commands.IssueLC` and the `TradeFinanceContract.verify()` dispatch structure (`when (command.value) { is Commands.IssueLC -> ...; else -> throw IllegalArgumentException(...) }`) that Tasks 5-7 add branches to. `TradeFinanceContractTest` — the shared contract test file Tasks 5-7 append to.

- [ ] **Step 1: Write the failing tests**

```kotlin
package com.utfl.tradefinance

import net.corda.core.crypto.SecureHash
import net.corda.core.identity.CordaX500Name
import net.corda.testing.core.TestIdentity
import net.corda.testing.node.MockServices
import net.corda.testing.node.ledger
import org.junit.Test
import java.time.Instant

class TradeFinanceContractTest {
    private val ledgerServices = MockServices(listOf("com.utfl.tradefinance"))

    private val importer = TestIdentity(CordaX500Name("Importer", "Mumbai", "IN"))
    private val exporter = TestIdentity(CordaX500Name("Exporter", "Mumbai", "IN"))
    private val issuingBank = TestIdentity(CordaX500Name("IssuingBank", "Tokyo", "JP"))
    private val advisingBank = TestIdentity(CordaX500Name("AdvisingBank", "Mumbai", "IN"))

    private fun issuedState(
        documentHashes: List<DocumentHashRecord> = listOf(
            DocumentHashRecord(
                documentId = "DOC-1",
                category = "LC_TERMS",
                documentType = "LC_APPLICATION",
                onChainHash = SecureHash.randomSHA256(),
                milestone = TradeMilestoneStatus.LC_ISSUED,
                anchoredAt = Instant.now()
            )
        )
    ) = TradeFinanceState(
        lcReference = "LC-2026-0001",
        importer = importer.party,
        exporter = exporter.party,
        issuingBank = issuingBank.party,
        advisingBank = advisingBank.party,
        lcTermsHash = SecureHash.randomSHA256(),
        status = TradeMilestoneStatus.LC_ISSUED,
        documentHashes = documentHashes
    )

    @Test
    fun `IssueLC succeeds with importer and issuing bank signatures and one LC_TERMS hash`() {
        ledgerServices.ledger {
            transaction {
                output(TradeFinanceContract.ID, issuedState())
                command(listOf(importer.publicKey, issuingBank.publicKey), TradeFinanceContract.Commands.IssueLC())
                verifies()
            }
        }
    }

    @Test
    fun `IssueLC fails if issuing bank signature missing`() {
        ledgerServices.ledger {
            transaction {
                output(TradeFinanceContract.ID, issuedState())
                command(listOf(importer.publicKey), TradeFinanceContract.Commands.IssueLC())
                fails()
            }
        }
    }

    @Test
    fun `IssueLC fails if an input state is present`() {
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, issuedState())
                output(TradeFinanceContract.ID, issuedState())
                command(listOf(importer.publicKey, issuingBank.publicKey), TradeFinanceContract.Commands.IssueLC())
                fails()
            }
        }
    }

    @Test
    fun `IssueLC fails without an LC_TERMS document hash`() {
        ledgerServices.ledger {
            transaction {
                output(TradeFinanceContract.ID, issuedState(documentHashes = emptyList()))
                command(listOf(importer.publicKey, issuingBank.publicKey), TradeFinanceContract.Commands.IssueLC())
                fails()
            }
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceContractTest"`
Expected: FAIL — `TradeFinanceContract.Commands` unresolved (contract is still the Task 3 placeholder).

- [ ] **Step 3: Replace `TradeFinanceContract.kt` with the real IssueLC implementation**

```kotlin
package com.utfl.tradefinance

import net.corda.core.contracts.CommandData
import net.corda.core.contracts.Contract
import net.corda.core.contracts.requireSingleCommand
import net.corda.core.contracts.requireThat
import net.corda.core.transactions.LedgerTransaction
import java.security.PublicKey

class TradeFinanceContract : Contract {
    companion object {
        const val ID = "com.utfl.tradefinance.TradeFinanceContract"
    }

    interface Commands : CommandData {
        class IssueLC : Commands
    }

    override fun verify(tx: LedgerTransaction) {
        val command = tx.commands.requireSingleCommand<Commands>()
        val signers = command.signers.toSet()

        when (command.value) {
            is Commands.IssueLC -> verifyIssueLC(tx, signers)
            else -> throw IllegalArgumentException("Unrecognised command ${command.value}")
        }
    }

    private fun verifyIssueLC(tx: LedgerTransaction, signers: Set<PublicKey>) {
        val output = tx.outputsOfType<TradeFinanceState>().single()
        requireThat {
            "No inputs should be consumed when issuing an LC" using tx.inputStates.isEmpty()
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
            "Status must be LC_ISSUED" using (output.status == TradeMilestoneStatus.LC_ISSUED)
            "Compliance outcome must not be set at issuance" using (output.complianceOutcome == null)
            "Exactly one LC_TERMS document hash must be anchored" using (
                output.documentHashes.count {
                    it.category == "LC_TERMS" && it.milestone == TradeMilestoneStatus.LC_ISSUED
                } == 1
            )
            "Importer and issuing bank must sign" using signers.containsAll(
                listOf(output.importer.owningKey, output.issuingBank.owningKey)
            )
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceContractTest"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceContract.kt contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceContractTest.kt
git commit -m "Implement TradeFinanceContract IssueLC command"
```

---

### Task 5: TradeFinanceContract — RegulatoryClear and ShipGoods

**Files:**
- Modify: `contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceContract.kt`
- Modify: `contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceContractTest.kt`

**Interfaces:**
- Consumes: everything from Task 4, plus `ComplianceOutcome` (Task 2)
- Produces: `TradeFinanceContract.Commands.RegulatoryClear`, `Commands.ShipGoods`, and the reusable private `verifyTransition(tx, signers, fromStatus, toStatus, requiredSigners, anchorCategory, extraCheck)` helper that Tasks 6-7 also use for their non-`AcceptDocs` commands.

- [ ] **Step 1: Add the failing tests** (append to `TradeFinanceContractTest.kt`, inside the class, after the existing IssueLC tests)

```kotlin
    private fun clearedState(from: TradeFinanceState) = from.copy(
        status = TradeMilestoneStatus.REGULATORY_CLEARED,
        complianceOutcome = ComplianceOutcome.CLEAR,
        documentHashes = from.documentHashes + DocumentHashRecord(
            documentId = "DOC-2",
            category = "COMPLIANCE_CERTS",
            documentType = "WHO_GMP_CERTIFICATE",
            onChainHash = SecureHash.randomSHA256(),
            milestone = TradeMilestoneStatus.REGULATORY_CLEARED,
            anchoredAt = Instant.now()
        )
    )

    @Test
    fun `RegulatoryClear succeeds with exporter and advising bank signatures`() {
        val input = issuedState()
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, clearedState(input))
                command(listOf(exporter.publicKey, advisingBank.publicKey), TradeFinanceContract.Commands.RegulatoryClear())
                verifies()
            }
        }
    }

    @Test
    fun `RegulatoryClear fails if advising bank signature missing`() {
        val input = issuedState()
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, clearedState(input))
                command(listOf(exporter.publicKey), TradeFinanceContract.Commands.RegulatoryClear())
                fails()
            }
        }
    }

    @Test
    fun `RegulatoryClear fails if it skips a milestone (input not LC_ISSUED)`() {
        val input = clearedState(issuedState())
        val output = input.copy(status = TradeMilestoneStatus.SHIPPED)
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, output)
                command(listOf(exporter.publicKey, advisingBank.publicKey), TradeFinanceContract.Commands.RegulatoryClear())
                fails()
            }
        }
    }

    @Test
    fun `ShipGoods succeeds with exporter and advising bank signatures`() {
        val input = clearedState(issuedState())
        val output = input.copy(
            status = TradeMilestoneStatus.SHIPPED,
            documentHashes = input.documentHashes + DocumentHashRecord(
                documentId = "DOC-3",
                category = "SHIPPING_DOCS",
                documentType = "BILL_OF_LADING",
                onChainHash = SecureHash.randomSHA256(),
                milestone = TradeMilestoneStatus.SHIPPED,
                anchoredAt = Instant.now()
            )
        )
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, output)
                command(listOf(exporter.publicKey, advisingBank.publicKey), TradeFinanceContract.Commands.ShipGoods())
                verifies()
            }
        }
    }

    @Test
    fun `ShipGoods fails without a new SHIPPING_DOCS hash`() {
        val input = clearedState(issuedState())
        val output = input.copy(status = TradeMilestoneStatus.SHIPPED)
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, output)
                command(listOf(exporter.publicKey, advisingBank.publicKey), TradeFinanceContract.Commands.ShipGoods())
                fails()
            }
        }
    }
```

Add the matching imports at the top of the file: `import com.utfl.tradefinance.ComplianceOutcome` is unnecessary (same package); no new imports are required beyond what Task 4 already added.

- [ ] **Step 2: Run tests to verify they fail**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceContractTest"`
Expected: FAIL — `Commands.RegulatoryClear`/`Commands.ShipGoods` unresolved.

- [ ] **Step 3: Extend `TradeFinanceContract.kt`**

Replace the whole file with:

```kotlin
package com.utfl.tradefinance

import net.corda.core.contracts.CommandData
import net.corda.core.contracts.Contract
import net.corda.core.contracts.requireSingleCommand
import net.corda.core.contracts.requireThat
import net.corda.core.identity.Party
import net.corda.core.transactions.LedgerTransaction
import java.security.PublicKey

class TradeFinanceContract : Contract {
    companion object {
        const val ID = "com.utfl.tradefinance.TradeFinanceContract"
    }

    interface Commands : CommandData {
        class IssueLC : Commands
        class RegulatoryClear : Commands
        class ShipGoods : Commands
    }

    override fun verify(tx: LedgerTransaction) {
        val command = tx.commands.requireSingleCommand<Commands>()
        val signers = command.signers.toSet()

        when (command.value) {
            is Commands.IssueLC -> verifyIssueLC(tx, signers)
            is Commands.RegulatoryClear -> verifyTransition(
                tx, signers,
                fromStatus = TradeMilestoneStatus.LC_ISSUED,
                toStatus = TradeMilestoneStatus.REGULATORY_CLEARED,
                requiredSigners = { listOf(it.exporter, it.advisingBank) },
                anchorCategory = "COMPLIANCE_CERTS"
            )
            is Commands.ShipGoods -> verifyTransition(
                tx, signers,
                fromStatus = TradeMilestoneStatus.REGULATORY_CLEARED,
                toStatus = TradeMilestoneStatus.SHIPPED,
                requiredSigners = { listOf(it.exporter, it.advisingBank) },
                anchorCategory = "SHIPPING_DOCS"
            )
            else -> throw IllegalArgumentException("Unrecognised command ${command.value}")
        }
    }

    private fun verifyIssueLC(tx: LedgerTransaction, signers: Set<PublicKey>) {
        val output = tx.outputsOfType<TradeFinanceState>().single()
        requireThat {
            "No inputs should be consumed when issuing an LC" using tx.inputStates.isEmpty()
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
            "Status must be LC_ISSUED" using (output.status == TradeMilestoneStatus.LC_ISSUED)
            "Compliance outcome must not be set at issuance" using (output.complianceOutcome == null)
            "Exactly one LC_TERMS document hash must be anchored" using (
                output.documentHashes.count {
                    it.category == "LC_TERMS" && it.milestone == TradeMilestoneStatus.LC_ISSUED
                } == 1
            )
            "Importer and issuing bank must sign" using signers.containsAll(
                listOf(output.importer.owningKey, output.issuingBank.owningKey)
            )
        }
    }

    private fun verifyTransition(
        tx: LedgerTransaction,
        signers: Set<PublicKey>,
        fromStatus: TradeMilestoneStatus,
        toStatus: TradeMilestoneStatus,
        requiredSigners: (TradeFinanceState) -> List<Party>,
        anchorCategory: String
    ) {
        requireThat {
            "Exactly one input state should be consumed" using (tx.inputStates.size == 1)
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
        }
        val input = tx.inputsOfType<TradeFinanceState>().single()
        val output = tx.outputsOfType<TradeFinanceState>().single()
        val required = requiredSigners(output)
        requireThat {
            "Input status must be $fromStatus" using (input.status == fromStatus)
            "Output status must be $toStatus" using (output.status == toStatus)
            "linearId must not change" using (input.linearId == output.linearId)
            "Parties must not change" using partiesUnchanged(input, output)
            "Required signers must sign" using signers.containsAll(required.map { it.owningKey })
            "Exactly one new $anchorCategory document hash must be anchored" using (
                output.documentHashes.size == input.documentHashes.size + 1 &&
                output.documentHashes.containsAll(input.documentHashes) &&
                output.documentHashes.count {
                    it.category == anchorCategory && it.milestone == toStatus
                } == 1
            )
        }
    }

    private fun partiesUnchanged(input: TradeFinanceState, output: TradeFinanceState): Boolean =
        input.importer == output.importer &&
        input.exporter == output.exporter &&
        input.issuingBank == output.issuingBank &&
        input.advisingBank == output.advisingBank
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceContractTest"`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceContract.kt contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceContractTest.kt
git commit -m "Implement TradeFinanceContract RegulatoryClear and ShipGoods commands"
```

---

### Task 6: TradeFinanceContract — AcceptDocs

**Files:**
- Modify: `contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceContract.kt`
- Modify: `contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceContractTest.kt`

**Interfaces:**
- Consumes: everything from Task 5
- Produces: `TradeFinanceContract.Commands.AcceptDocs` — the one milestone command with a single required signer and no new document hash.

- [ ] **Step 1: Add the failing tests** (append to the test class)

```kotlin
    private fun shippedState(): TradeFinanceState {
        val input = clearedState(issuedState())
        return input.copy(
            status = TradeMilestoneStatus.SHIPPED,
            documentHashes = input.documentHashes + DocumentHashRecord(
                documentId = "DOC-3",
                category = "SHIPPING_DOCS",
                documentType = "BILL_OF_LADING",
                onChainHash = SecureHash.randomSHA256(),
                milestone = TradeMilestoneStatus.SHIPPED,
                anchoredAt = Instant.now()
            )
        )
    }

    @Test
    fun `AcceptDocs succeeds with only the issuing bank signature and unchanged document hashes`() {
        val input = shippedState()
        val output = input.copy(status = TradeMilestoneStatus.ACCEPTED)
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, output)
                command(listOf(issuingBank.publicKey), TradeFinanceContract.Commands.AcceptDocs())
                verifies()
            }
        }
    }

    @Test
    fun `AcceptDocs fails if the issuing bank signature is missing`() {
        val input = shippedState()
        val output = input.copy(status = TradeMilestoneStatus.ACCEPTED)
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, output)
                command(listOf(exporter.publicKey), TradeFinanceContract.Commands.AcceptDocs())
                fails()
            }
        }
    }

    @Test
    fun `AcceptDocs fails if document hashes change`() {
        val input = shippedState()
        val output = input.copy(
            status = TradeMilestoneStatus.ACCEPTED,
            documentHashes = input.documentHashes + DocumentHashRecord(
                documentId = "DOC-4",
                category = "UNEXPECTED",
                documentType = "UNEXPECTED",
                onChainHash = SecureHash.randomSHA256(),
                milestone = TradeMilestoneStatus.ACCEPTED,
                anchoredAt = Instant.now()
            )
        )
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, output)
                command(listOf(issuingBank.publicKey), TradeFinanceContract.Commands.AcceptDocs())
                fails()
            }
        }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceContractTest"`
Expected: FAIL — `Commands.AcceptDocs` unresolved.

- [ ] **Step 3: Add `Commands.AcceptDocs` and its verification**

In `TradeFinanceContract.kt`:

1. Add `class AcceptDocs : Commands` inside the `Commands` interface, after `ShipGoods`.
2. Add a branch in `verify()`, after the `ShipGoods` branch: `is Commands.AcceptDocs -> verifyAcceptDocs(tx, signers)`.
3. Add the new private method, after `verifyTransition`:

```kotlin
    private fun verifyAcceptDocs(tx: LedgerTransaction, signers: Set<PublicKey>) {
        requireThat {
            "Exactly one input state should be consumed" using (tx.inputStates.size == 1)
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
        }
        val input = tx.inputsOfType<TradeFinanceState>().single()
        val output = tx.outputsOfType<TradeFinanceState>().single()
        requireThat {
            "Input status must be SHIPPED" using (input.status == TradeMilestoneStatus.SHIPPED)
            "Output status must be ACCEPTED" using (output.status == TradeMilestoneStatus.ACCEPTED)
            "linearId must not change" using (input.linearId == output.linearId)
            "Parties must not change" using partiesUnchanged(input, output)
            "Document hashes must not change for a pure sign-off" using (input.documentHashes == output.documentHashes)
            "Only the issuing bank is required to sign" using signers.contains(output.issuingBank.owningKey)
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceContractTest"`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceContract.kt contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceContractTest.kt
git commit -m "Implement TradeFinanceContract AcceptDocs command"
```

---

### Task 7: TradeFinanceContract — SettlePayment and RegulatoryClose

**Files:**
- Modify: `contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceContract.kt`
- Modify: `contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceContractTest.kt`

**Interfaces:**
- Consumes: everything from Task 6
- Produces: `TradeFinanceContract.Commands.SettlePayment`, `Commands.RegulatoryClose` — completing all 6 milestone commands. `TradeFinanceContract` is now feature-complete for Task 8 onward.

- [ ] **Step 1: Add the failing tests** (append to the test class)

```kotlin
    private fun acceptedState(): TradeFinanceState = shippedState().copy(status = TradeMilestoneStatus.ACCEPTED)

    private fun settledState(): TradeFinanceState {
        val input = acceptedState()
        return input.copy(
            status = TradeMilestoneStatus.SETTLED,
            documentHashes = input.documentHashes + DocumentHashRecord(
                documentId = "DOC-5",
                category = "PAYMENT_MESSAGE",
                documentType = "MT202",
                onChainHash = SecureHash.randomSHA256(),
                milestone = TradeMilestoneStatus.SETTLED,
                anchoredAt = Instant.now()
            )
        )
    }

    @Test
    fun `SettlePayment succeeds with issuing bank and advising bank signatures`() {
        val input = acceptedState()
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, settledState())
                command(listOf(issuingBank.publicKey, advisingBank.publicKey), TradeFinanceContract.Commands.SettlePayment())
                verifies()
            }
        }
    }

    @Test
    fun `SettlePayment fails if advising bank signature missing`() {
        val input = acceptedState()
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, settledState())
                command(listOf(issuingBank.publicKey), TradeFinanceContract.Commands.SettlePayment())
                fails()
            }
        }
    }

    @Test
    fun `SettlePayment fails if a party field is mutated`() {
        val input = acceptedState()
        val mutatedOutput = settledState().copy(advisingBank = TestIdentity(CordaX500Name("Other", "London", "GB")).party)
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, mutatedOutput)
                command(listOf(issuingBank.publicKey, advisingBank.publicKey), TradeFinanceContract.Commands.SettlePayment())
                fails()
            }
        }
    }

    @Test
    fun `RegulatoryClose succeeds with importer and issuing bank signatures`() {
        val input = settledState()
        val output = input.copy(
            status = TradeMilestoneStatus.CLOSED,
            documentHashes = input.documentHashes + DocumentHashRecord(
                documentId = "DOC-6",
                category = "CLOSURE_FILINGS",
                documentType = "EDPMS_CLOSURE_ENTRY",
                onChainHash = SecureHash.randomSHA256(),
                milestone = TradeMilestoneStatus.CLOSED,
                anchoredAt = Instant.now()
            )
        )
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, output)
                command(listOf(importer.publicKey, issuingBank.publicKey), TradeFinanceContract.Commands.RegulatoryClose())
                verifies()
            }
        }
    }

    @Test
    fun `RegulatoryClose fails without a new CLOSURE_FILINGS hash`() {
        val input = settledState()
        val output = input.copy(status = TradeMilestoneStatus.CLOSED)
        ledgerServices.ledger {
            transaction {
                input(TradeFinanceContract.ID, input)
                output(TradeFinanceContract.ID, output)
                command(listOf(importer.publicKey, issuingBank.publicKey), TradeFinanceContract.Commands.RegulatoryClose())
                fails()
            }
        }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceContractTest"`
Expected: FAIL — `Commands.SettlePayment`/`Commands.RegulatoryClose` unresolved.

- [ ] **Step 3: Add the two remaining commands**

In `TradeFinanceContract.kt`:

1. Add `class SettlePayment : Commands` and `class RegulatoryClose : Commands` inside `Commands`, after `AcceptDocs`.
2. Add two branches in `verify()`, after the `AcceptDocs` branch and before `else`:

```kotlin
            is Commands.SettlePayment -> verifyTransition(
                tx, signers,
                fromStatus = TradeMilestoneStatus.ACCEPTED,
                toStatus = TradeMilestoneStatus.SETTLED,
                requiredSigners = { listOf(it.issuingBank, it.advisingBank) },
                anchorCategory = "PAYMENT_MESSAGE"
            )
            is Commands.RegulatoryClose -> verifyTransition(
                tx, signers,
                fromStatus = TradeMilestoneStatus.SETTLED,
                toStatus = TradeMilestoneStatus.CLOSED,
                requiredSigners = { listOf(it.importer, it.issuingBank) },
                anchorCategory = "CLOSURE_FILINGS"
            )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew :contracts:test --tests "com.utfl.tradefinance.TradeFinanceContractTest"`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add contracts/src/main/kotlin/com/utfl/tradefinance/TradeFinanceContract.kt contracts/src/test/kotlin/com/utfl/tradefinance/TradeFinanceContractTest.kt
git commit -m "Implement TradeFinanceContract SettlePayment and RegulatoryClose commands"
```

---

### Task 8: Flow scaffolding and IssueLCFlow

**Files:**
- Create: `workflows/src/main/kotlin/com/utfl/tradefinance/flows/FlowSupport.kt`
- Create: `workflows/src/main/kotlin/com/utfl/tradefinance/flows/IssueLCFlow.kt`
- Create: `workflows/src/test/kotlin/com/utfl/tradefinance/flows/AbstractFlowTest.kt`
- Create: `workflows/src/test/kotlin/com/utfl/tradefinance/flows/IssueLCFlowTest.kt`

**Interfaces:**
- Consumes: `TradeFinanceState`, `TradeFinanceContract`, `DocumentHashRecord`, `TradeMilestoneStatus` (contracts module, Tasks 2-7)
- Produces: `AbstractTradeFinanceResponder(counterpartySession: FlowSession)` and `fun FlowLogic<*>.fetchUnconsumedTradeState(linearId: UniqueIdentifier): StateAndRef<TradeFinanceState>` — both reused by every flow in Tasks 9-10. `IssueLCFlow.Initiator(issuingBank: Party, exporter: Party, advisingBank: Party, lcReference: String, lcTermsDocumentId: String, lcTermsHash: SecureHash): FlowLogic<SignedTransaction>` and `IssueLCFlow.Responder`. `AbstractFlowTest` (4-node + notary `MockNetwork` fixture) reused by every flow test in Tasks 9-11.

- [ ] **Step 1: Write `AbstractFlowTest.kt`** (the fixture the failing test in Step 2 depends on)

```kotlin
package com.utfl.tradefinance.flows

import net.corda.core.identity.CordaX500Name
import net.corda.testing.node.MockNetwork
import net.corda.testing.node.MockNetworkNotarySpec
import net.corda.testing.node.MockNetworkParameters
import net.corda.testing.node.StartedMockNode
import net.corda.testing.node.TestCordapp
import org.junit.After
import org.junit.Before

abstract class AbstractFlowTest {
    protected lateinit var network: MockNetwork
    protected lateinit var importerNode: StartedMockNode
    protected lateinit var exporterNode: StartedMockNode
    protected lateinit var issuingBankNode: StartedMockNode
    protected lateinit var advisingBankNode: StartedMockNode

    @Before
    fun setup() {
        network = MockNetwork(
            MockNetworkParameters(
                cordappsForAllNodes = listOf(
                    TestCordapp.findCordapp("com.utfl.tradefinance"),
                    TestCordapp.findCordapp("com.utfl.tradefinance.flows")
                ),
                notarySpecs = listOf(MockNetworkNotarySpec(CordaX500Name("Notary", "London", "GB")))
            )
        )
        importerNode = network.createPartyNode(CordaX500Name("Importer", "Mumbai", "IN"))
        exporterNode = network.createPartyNode(CordaX500Name("Exporter", "Mumbai", "IN"))
        issuingBankNode = network.createPartyNode(CordaX500Name("IssuingBank", "Tokyo", "JP"))
        advisingBankNode = network.createPartyNode(CordaX500Name("AdvisingBank", "Mumbai", "IN"))
        network.runNetwork()
    }

    @After
    fun tearDown() {
        network.stopNodes()
    }
}
```

- [ ] **Step 2: Write the failing test `IssueLCFlowTest.kt`**

```kotlin
package com.utfl.tradefinance.flows

import com.utfl.tradefinance.TradeFinanceState
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.crypto.SecureHash
import net.corda.core.node.services.Vault
import net.corda.core.node.services.queryBy
import net.corda.core.node.services.vault.QueryCriteria
import net.corda.core.transactions.SignedTransaction
import org.junit.Test
import java.util.concurrent.Future
import kotlin.test.assertEquals

class IssueLCFlowTest : AbstractFlowTest() {
    @Test
    fun `IssueLC finalizes on all four nodes`() {
        val flow = IssueLCFlow.Initiator(
            issuingBank = issuingBankNode.info.legalIdentities[0],
            exporter = exporterNode.info.legalIdentities[0],
            advisingBank = advisingBankNode.info.legalIdentities[0],
            lcReference = "LC-2026-0001",
            lcTermsDocumentId = "DOC-1",
            lcTermsHash = SecureHash.randomSHA256()
        )
        val future: Future<SignedTransaction> = importerNode.startFlow(flow)
        network.runNetwork()
        val stx = future.get()

        listOf(importerNode, exporterNode, issuingBankNode, advisingBankNode).forEach { node ->
            val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
            val states = node.services.vaultService.queryBy<TradeFinanceState>(criteria).states
            assertEquals(1, states.size)
            assertEquals(TradeMilestoneStatus.LC_ISSUED, states.single().state.data.status)
            assertEquals(stx.id, states.single().ref.txhash)
        }
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `./gradlew :workflows:test --tests "com.utfl.tradefinance.flows.IssueLCFlowTest"`
Expected: FAIL — `IssueLCFlow` unresolved.

- [ ] **Step 4: Write `FlowSupport.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.TradeFinanceState
import net.corda.core.contracts.StateAndRef
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.ReceiveFinalityFlow
import net.corda.core.flows.SignTransactionFlow
import net.corda.core.node.services.Vault
import net.corda.core.node.services.queryBy
import net.corda.core.node.services.vault.QueryCriteria
import net.corda.core.transactions.SignedTransaction
import net.corda.core.utilities.unwrap

fun FlowLogic<*>.fetchUnconsumedTradeState(linearId: UniqueIdentifier): StateAndRef<TradeFinanceState> {
    val criteria = QueryCriteria.LinearStateQueryCriteria(
        linearId = listOf(linearId),
        status = Vault.StateStatus.UNCONSUMED
    )
    return serviceHub.vaultService.queryBy<TradeFinanceState>(criteria).states.single()
}

abstract class AbstractTradeFinanceResponder(private val counterpartySession: FlowSession) : FlowLogic<Unit>() {
    @Suspendable
    override fun call() {
        val isRequiredSigner = counterpartySession.receive<Boolean>().unwrap { it }
        val txId = if (isRequiredSigner) {
            val signTransactionFlow = object : SignTransactionFlow(counterpartySession) {
                override fun checkTransaction(stx: SignedTransaction) {
                    // All business rules are enforced by TradeFinanceContract.verify().
                }
            }
            subFlow(signTransactionFlow).id
        } else {
            null
        }
        subFlow(ReceiveFinalityFlow(counterpartySession, expectedTxId = txId))
    }
}
```

- [ ] **Step 5: Write `IssueLCFlow.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.DocumentHashRecord
import com.utfl.tradefinance.TradeFinanceContract
import com.utfl.tradefinance.TradeFinanceState
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.crypto.SecureHash
import net.corda.core.flows.CollectSignaturesFlow
import net.corda.core.flows.FinalityFlow
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.identity.Party
import net.corda.core.transactions.SignedTransaction
import net.corda.core.transactions.TransactionBuilder
import net.corda.core.utilities.ProgressTracker
import java.time.Instant

object IssueLCFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(
        private val issuingBank: Party,
        private val exporter: Party,
        private val advisingBank: Party,
        private val lcReference: String,
        private val lcTermsDocumentId: String,
        private val lcTermsHash: SecureHash
    ) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val importer = ourIdentity
            val notary = serviceHub.networkMapCache.notaryIdentities.first()

            val output = TradeFinanceState(
                lcReference = lcReference,
                importer = importer,
                exporter = exporter,
                issuingBank = issuingBank,
                advisingBank = advisingBank,
                lcTermsHash = lcTermsHash,
                status = TradeMilestoneStatus.LC_ISSUED,
                documentHashes = listOf(
                    DocumentHashRecord(
                        documentId = lcTermsDocumentId,
                        category = "LC_TERMS",
                        documentType = "LC_APPLICATION",
                        onChainHash = lcTermsHash,
                        milestone = TradeMilestoneStatus.LC_ISSUED,
                        anchoredAt = Instant.now()
                    )
                )
            )

            val requiredSigners = listOf(importer, issuingBank)

            val builder = TransactionBuilder(notary)
                .addOutputState(output, TradeFinanceContract.ID)
                .addCommand(TradeFinanceContract.Commands.IssueLC(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != importer }
            val sessionsByParty = counterparties.associateWith { initiateFlow(it) }
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            val signerSessions = requiredSigners.filter { it != importer }.map { sessionsByParty.getValue(it) }
            val fullySignedTx = subFlow(CollectSignaturesFlow(partiallySignedTx, signerSessions))

            return subFlow(FinalityFlow(fullySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `./gradlew :workflows:test --tests "com.utfl.tradefinance.flows.IssueLCFlowTest"`
Expected: PASS (1 test)

- [ ] **Step 7: Commit**

```bash
git add workflows/src/main/kotlin/com/utfl/tradefinance/flows/FlowSupport.kt workflows/src/main/kotlin/com/utfl/tradefinance/flows/IssueLCFlow.kt workflows/src/test/kotlin/com/utfl/tradefinance/flows/AbstractFlowTest.kt workflows/src/test/kotlin/com/utfl/tradefinance/flows/IssueLCFlowTest.kt
git commit -m "Add IssueLCFlow with shared flow support"
```

---

### Task 9: RegulatoryClearFlow and ShipGoodsFlow

**Files:**
- Create: `workflows/src/main/kotlin/com/utfl/tradefinance/flows/RegulatoryClearFlow.kt`
- Create: `workflows/src/main/kotlin/com/utfl/tradefinance/flows/ShipGoodsFlow.kt`
- Create: `workflows/src/test/kotlin/com/utfl/tradefinance/flows/RegulatoryClearAndShipGoodsFlowTest.kt`

**Interfaces:**
- Consumes: `AbstractTradeFinanceResponder`, `fetchUnconsumedTradeState` (Task 8); `ComplianceOutcome` (Task 2)
- Produces: `RegulatoryClearFlow.Initiator(linearId: UniqueIdentifier, complianceOutcome: ComplianceOutcome, documentId: String, documentType: String, onChainHash: SecureHash)`, `ShipGoodsFlow.Initiator(linearId: UniqueIdentifier, documentId: String, documentType: String, onChainHash: SecureHash)` — both `FlowLogic<SignedTransaction>`, both with a matching `Responder`.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.utfl.tradefinance.flows

import com.utfl.tradefinance.ComplianceOutcome
import com.utfl.tradefinance.TradeFinanceState
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.crypto.SecureHash
import net.corda.core.node.services.Vault
import net.corda.core.node.services.queryBy
import net.corda.core.node.services.vault.QueryCriteria
import org.junit.Test
import kotlin.test.assertEquals

class RegulatoryClearAndShipGoodsFlowTest : AbstractFlowTest() {
    private fun issueLC(): TradeFinanceState {
        val flow = IssueLCFlow.Initiator(
            issuingBank = issuingBankNode.info.legalIdentities[0],
            exporter = exporterNode.info.legalIdentities[0],
            advisingBank = advisingBankNode.info.legalIdentities[0],
            lcReference = "LC-2026-0001",
            lcTermsDocumentId = "DOC-1",
            lcTermsHash = SecureHash.randomSHA256()
        )
        val future = importerNode.startFlow(flow)
        network.runNetwork()
        return future.get().tx.outputsOfType(TradeFinanceState::class.java).single()
    }

    @Test
    fun `RegulatoryClear then ShipGoods advance the milestone on all four nodes`() {
        val issued = issueLC()

        val clearFlow = RegulatoryClearFlow.Initiator(
            linearId = issued.linearId,
            complianceOutcome = ComplianceOutcome.CLEAR,
            documentId = "DOC-2",
            documentType = "WHO_GMP_CERTIFICATE",
            onChainHash = SecureHash.randomSHA256()
        )
        val clearFuture = exporterNode.startFlow(clearFlow)
        network.runNetwork()
        clearFuture.get()

        val shipFlow = ShipGoodsFlow.Initiator(
            linearId = issued.linearId,
            documentId = "DOC-3",
            documentType = "BILL_OF_LADING",
            onChainHash = SecureHash.randomSHA256()
        )
        val shipFuture = exporterNode.startFlow(shipFlow)
        network.runNetwork()
        shipFuture.get()

        listOf(importerNode, exporterNode, issuingBankNode, advisingBankNode).forEach { node ->
            val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
            val states = node.services.vaultService.queryBy<TradeFinanceState>(criteria).states
            assertEquals(1, states.size)
            assertEquals(TradeMilestoneStatus.SHIPPED, states.single().state.data.status)
            assertEquals(3, states.single().state.data.documentHashes.size)
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :workflows:test --tests "com.utfl.tradefinance.flows.RegulatoryClearAndShipGoodsFlowTest"`
Expected: FAIL — `RegulatoryClearFlow`/`ShipGoodsFlow` unresolved.

- [ ] **Step 3: Write `RegulatoryClearFlow.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.ComplianceOutcome
import com.utfl.tradefinance.DocumentHashRecord
import com.utfl.tradefinance.TradeFinanceContract
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.flows.CollectSignaturesFlow
import net.corda.core.flows.FinalityFlow
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.identity.Party
import net.corda.core.transactions.SignedTransaction
import net.corda.core.transactions.TransactionBuilder
import net.corda.core.utilities.ProgressTracker
import java.time.Instant

object RegulatoryClearFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(
        private val linearId: UniqueIdentifier,
        private val complianceOutcome: ComplianceOutcome,
        private val documentId: String,
        private val documentType: String,
        private val onChainHash: SecureHash
    ) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val inputStateAndRef = fetchUnconsumedTradeState(linearId)
            val input = inputStateAndRef.state.data
            val notary = inputStateAndRef.state.notary

            val output = input.copy(
                status = TradeMilestoneStatus.REGULATORY_CLEARED,
                complianceOutcome = complianceOutcome,
                documentHashes = input.documentHashes + DocumentHashRecord(
                    documentId = documentId,
                    category = "COMPLIANCE_CERTS",
                    documentType = documentType,
                    onChainHash = onChainHash,
                    milestone = TradeMilestoneStatus.REGULATORY_CLEARED,
                    anchoredAt = Instant.now()
                )
            )

            val requiredSigners = listOf(output.exporter, output.advisingBank)

            val builder = TransactionBuilder(notary)
                .addInputState(inputStateAndRef)
                .addOutputState(output, TradeFinanceContract.ID)
                .addCommand(TradeFinanceContract.Commands.RegulatoryClear(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != ourIdentity }
            val sessionsByParty = counterparties.associateWith { initiateFlow(it) }
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            val signerSessions = requiredSigners.filter { it != ourIdentity }.map { sessionsByParty.getValue(it) }
            val fullySignedTx = subFlow(CollectSignaturesFlow(partiallySignedTx, signerSessions))

            return subFlow(FinalityFlow(fullySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
```

- [ ] **Step 4: Write `ShipGoodsFlow.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.DocumentHashRecord
import com.utfl.tradefinance.TradeFinanceContract
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.flows.CollectSignaturesFlow
import net.corda.core.flows.FinalityFlow
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.identity.Party
import net.corda.core.transactions.SignedTransaction
import net.corda.core.transactions.TransactionBuilder
import net.corda.core.utilities.ProgressTracker
import java.time.Instant

object ShipGoodsFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(
        private val linearId: UniqueIdentifier,
        private val documentId: String,
        private val documentType: String,
        private val onChainHash: SecureHash
    ) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val inputStateAndRef = fetchUnconsumedTradeState(linearId)
            val input = inputStateAndRef.state.data
            val notary = inputStateAndRef.state.notary

            val output = input.copy(
                status = TradeMilestoneStatus.SHIPPED,
                documentHashes = input.documentHashes + DocumentHashRecord(
                    documentId = documentId,
                    category = "SHIPPING_DOCS",
                    documentType = documentType,
                    onChainHash = onChainHash,
                    milestone = TradeMilestoneStatus.SHIPPED,
                    anchoredAt = Instant.now()
                )
            )

            val requiredSigners = listOf(output.exporter, output.advisingBank)

            val builder = TransactionBuilder(notary)
                .addInputState(inputStateAndRef)
                .addOutputState(output, TradeFinanceContract.ID)
                .addCommand(TradeFinanceContract.Commands.ShipGoods(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != ourIdentity }
            val sessionsByParty = counterparties.associateWith { initiateFlow(it) }
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            val signerSessions = requiredSigners.filter { it != ourIdentity }.map { sessionsByParty.getValue(it) }
            val fullySignedTx = subFlow(CollectSignaturesFlow(partiallySignedTx, signerSessions))

            return subFlow(FinalityFlow(fullySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./gradlew :workflows:test --tests "com.utfl.tradefinance.flows.RegulatoryClearAndShipGoodsFlowTest"`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add workflows/src/main/kotlin/com/utfl/tradefinance/flows/RegulatoryClearFlow.kt workflows/src/main/kotlin/com/utfl/tradefinance/flows/ShipGoodsFlow.kt workflows/src/test/kotlin/com/utfl/tradefinance/flows/RegulatoryClearAndShipGoodsFlowTest.kt
git commit -m "Add RegulatoryClearFlow and ShipGoodsFlow"
```

---

### Task 10: AcceptDocsFlow, SettlePaymentFlow, RegulatoryCloseFlow

**Files:**
- Create: `workflows/src/main/kotlin/com/utfl/tradefinance/flows/AcceptDocsFlow.kt`
- Create: `workflows/src/main/kotlin/com/utfl/tradefinance/flows/SettlePaymentFlow.kt`
- Create: `workflows/src/main/kotlin/com/utfl/tradefinance/flows/RegulatoryCloseFlow.kt`
- Create: `workflows/src/test/kotlin/com/utfl/tradefinance/flows/RemainingMilestonesFlowTest.kt`

**Interfaces:**
- Consumes: `AbstractTradeFinanceResponder`, `fetchUnconsumedTradeState` (Task 8)
- Produces: `AcceptDocsFlow.Initiator(linearId: UniqueIdentifier)`, `SettlePaymentFlow.Initiator(linearId: UniqueIdentifier, documentId: String, documentType: String, onChainHash: SecureHash)`, `RegulatoryCloseFlow.Initiator(linearId: UniqueIdentifier, documentId: String, documentType: String, onChainHash: SecureHash)` — all `FlowLogic<SignedTransaction>` with matching `Responder`s. All six milestone flows now exist.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.utfl.tradefinance.flows

import com.utfl.tradefinance.ComplianceOutcome
import com.utfl.tradefinance.TradeFinanceState
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.node.services.Vault
import net.corda.core.node.services.queryBy
import net.corda.core.node.services.vault.QueryCriteria
import org.junit.Test
import kotlin.test.assertEquals

class RemainingMilestonesFlowTest : AbstractFlowTest() {
    private fun issueClearAndShip(): UniqueIdentifier {
        val issueFlow = IssueLCFlow.Initiator(
            issuingBank = issuingBankNode.info.legalIdentities[0],
            exporter = exporterNode.info.legalIdentities[0],
            advisingBank = advisingBankNode.info.legalIdentities[0],
            lcReference = "LC-2026-0001",
            lcTermsDocumentId = "DOC-1",
            lcTermsHash = SecureHash.randomSHA256()
        )
        val issueFuture = importerNode.startFlow(issueFlow)
        network.runNetwork()
        val linearId = issueFuture.get().tx.outputsOfType(TradeFinanceState::class.java).single().linearId

        val clearFuture = exporterNode.startFlow(
            RegulatoryClearFlow.Initiator(linearId, ComplianceOutcome.CLEAR, "DOC-2", "WHO_GMP_CERTIFICATE", SecureHash.randomSHA256())
        )
        network.runNetwork()
        clearFuture.get()

        val shipFuture = exporterNode.startFlow(
            ShipGoodsFlow.Initiator(linearId, "DOC-3", "BILL_OF_LADING", SecureHash.randomSHA256())
        )
        network.runNetwork()
        shipFuture.get()

        return linearId
    }

    @Test
    fun `AcceptDocs, SettlePayment and RegulatoryClose drive the trade to CLOSED on all four nodes`() {
        val linearId = issueClearAndShip()

        val acceptFuture = issuingBankNode.startFlow(AcceptDocsFlow.Initiator(linearId))
        network.runNetwork()
        acceptFuture.get()

        val settleFuture = issuingBankNode.startFlow(
            SettlePaymentFlow.Initiator(linearId, "DOC-5", "MT202", SecureHash.randomSHA256())
        )
        network.runNetwork()
        settleFuture.get()

        val closeFuture = importerNode.startFlow(
            RegulatoryCloseFlow.Initiator(linearId, "DOC-6", "EDPMS_CLOSURE_ENTRY", SecureHash.randomSHA256())
        )
        network.runNetwork()
        closeFuture.get()

        listOf(importerNode, exporterNode, issuingBankNode, advisingBankNode).forEach { node ->
            val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
            val states = node.services.vaultService.queryBy<TradeFinanceState>(criteria).states
            assertEquals(1, states.size)
            assertEquals(TradeMilestoneStatus.CLOSED, states.single().state.data.status)
            assertEquals(6, states.single().state.data.documentHashes.size)
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :workflows:test --tests "com.utfl.tradefinance.flows.RemainingMilestonesFlowTest"`
Expected: FAIL — `AcceptDocsFlow`/`SettlePaymentFlow`/`RegulatoryCloseFlow` unresolved.

- [ ] **Step 3: Write `AcceptDocsFlow.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.TradeFinanceContract
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.flows.FinalityFlow
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.identity.Party
import net.corda.core.transactions.SignedTransaction
import net.corda.core.transactions.TransactionBuilder
import net.corda.core.utilities.ProgressTracker

object AcceptDocsFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(private val linearId: UniqueIdentifier) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val inputStateAndRef = fetchUnconsumedTradeState(linearId)
            val input = inputStateAndRef.state.data
            val notary = inputStateAndRef.state.notary

            val output = input.copy(status = TradeMilestoneStatus.ACCEPTED)
            val requiredSigners = listOf(output.issuingBank)

            val builder = TransactionBuilder(notary)
                .addInputState(inputStateAndRef)
                .addOutputState(output, TradeFinanceContract.ID)
                .addCommand(TradeFinanceContract.Commands.AcceptDocs(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != ourIdentity }
            val sessionsByParty = counterparties.associateWith { initiateFlow(it) }
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            return subFlow(FinalityFlow(partiallySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
```

- [ ] **Step 4: Write `SettlePaymentFlow.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.DocumentHashRecord
import com.utfl.tradefinance.TradeFinanceContract
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.flows.CollectSignaturesFlow
import net.corda.core.flows.FinalityFlow
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.identity.Party
import net.corda.core.transactions.SignedTransaction
import net.corda.core.transactions.TransactionBuilder
import net.corda.core.utilities.ProgressTracker
import java.time.Instant

object SettlePaymentFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(
        private val linearId: UniqueIdentifier,
        private val documentId: String,
        private val documentType: String,
        private val onChainHash: SecureHash
    ) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val inputStateAndRef = fetchUnconsumedTradeState(linearId)
            val input = inputStateAndRef.state.data
            val notary = inputStateAndRef.state.notary

            val output = input.copy(
                status = TradeMilestoneStatus.SETTLED,
                documentHashes = input.documentHashes + DocumentHashRecord(
                    documentId = documentId,
                    category = "PAYMENT_MESSAGE",
                    documentType = documentType,
                    onChainHash = onChainHash,
                    milestone = TradeMilestoneStatus.SETTLED,
                    anchoredAt = Instant.now()
                )
            )

            val requiredSigners = listOf(output.issuingBank, output.advisingBank)

            val builder = TransactionBuilder(notary)
                .addInputState(inputStateAndRef)
                .addOutputState(output, TradeFinanceContract.ID)
                .addCommand(TradeFinanceContract.Commands.SettlePayment(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != ourIdentity }
            val sessionsByParty = counterparties.associateWith { initiateFlow(it) }
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            val signerSessions = requiredSigners.filter { it != ourIdentity }.map { sessionsByParty.getValue(it) }
            val fullySignedTx = subFlow(CollectSignaturesFlow(partiallySignedTx, signerSessions))

            return subFlow(FinalityFlow(fullySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
```

- [ ] **Step 5: Write `RegulatoryCloseFlow.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.DocumentHashRecord
import com.utfl.tradefinance.TradeFinanceContract
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.flows.CollectSignaturesFlow
import net.corda.core.flows.FinalityFlow
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.identity.Party
import net.corda.core.transactions.SignedTransaction
import net.corda.core.transactions.TransactionBuilder
import net.corda.core.utilities.ProgressTracker
import java.time.Instant

object RegulatoryCloseFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(
        private val linearId: UniqueIdentifier,
        private val documentId: String,
        private val documentType: String,
        private val onChainHash: SecureHash
    ) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val inputStateAndRef = fetchUnconsumedTradeState(linearId)
            val input = inputStateAndRef.state.data
            val notary = inputStateAndRef.state.notary

            val output = input.copy(
                status = TradeMilestoneStatus.CLOSED,
                documentHashes = input.documentHashes + DocumentHashRecord(
                    documentId = documentId,
                    category = "CLOSURE_FILINGS",
                    documentType = documentType,
                    onChainHash = onChainHash,
                    milestone = TradeMilestoneStatus.CLOSED,
                    anchoredAt = Instant.now()
                )
            )

            val requiredSigners = listOf(output.importer, output.issuingBank)

            val builder = TransactionBuilder(notary)
                .addInputState(inputStateAndRef)
                .addOutputState(output, TradeFinanceContract.ID)
                .addCommand(TradeFinanceContract.Commands.RegulatoryClose(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != ourIdentity }
            val sessionsByParty = counterparties.associateWith { initiateFlow(it) }
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            val signerSessions = requiredSigners.filter { it != ourIdentity }.map { sessionsByParty.getValue(it) }
            val fullySignedTx = subFlow(CollectSignaturesFlow(partiallySignedTx, signerSessions))

            return subFlow(FinalityFlow(fullySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `./gradlew :workflows:test --tests "com.utfl.tradefinance.flows.RemainingMilestonesFlowTest"`
Expected: PASS (1 test)

- [ ] **Step 7: Commit**

```bash
git add workflows/src/main/kotlin/com/utfl/tradefinance/flows/AcceptDocsFlow.kt workflows/src/main/kotlin/com/utfl/tradefinance/flows/SettlePaymentFlow.kt workflows/src/main/kotlin/com/utfl/tradefinance/flows/RegulatoryCloseFlow.kt workflows/src/test/kotlin/com/utfl/tradefinance/flows/RemainingMilestonesFlowTest.kt
git commit -m "Add AcceptDocsFlow, SettlePaymentFlow and RegulatoryCloseFlow"
```

---

### Task 11: Full end-to-end lifecycle test with observer-visibility assertion

**Files:**
- Create: `workflows/src/test/kotlin/com/utfl/tradefinance/flows/FullLifecycleFlowTest.kt`

**Interfaces:**
- Consumes: all six flows (Tasks 8-10)
- Produces: nothing new for later tasks — this is the spec's "drive one trade through the full six-milestone lifecycle end-to-end" acceptance test, plus the "a party not required to sign a given transition still receives the finalized transaction" check from the spec's testing section.

- [ ] **Step 1: Write the test**

```kotlin
package com.utfl.tradefinance.flows

import com.utfl.tradefinance.ComplianceOutcome
import com.utfl.tradefinance.TradeFinanceState
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.node.services.Vault
import net.corda.core.node.services.queryBy
import net.corda.core.node.services.vault.QueryCriteria
import org.junit.Test
import kotlin.test.assertEquals

class FullLifecycleFlowTest : AbstractFlowTest() {

    private fun latestState(node: net.corda.testing.node.StartedMockNode, linearId: UniqueIdentifier): TradeFinanceState {
        val criteria = QueryCriteria.LinearStateQueryCriteria(linearId = listOf(linearId), status = Vault.StateStatus.UNCONSUMED)
        return node.services.vaultService.queryBy<TradeFinanceState>(criteria).states.single().state.data
    }

    @Test
    fun `one trade moves through all six milestones and every party sees every transition`() {
        val issueFuture = importerNode.startFlow(
            IssueLCFlow.Initiator(
                issuingBank = issuingBankNode.info.legalIdentities[0],
                exporter = exporterNode.info.legalIdentities[0],
                advisingBank = advisingBankNode.info.legalIdentities[0],
                lcReference = "LC-2026-0001",
                lcTermsDocumentId = "DOC-1",
                lcTermsHash = SecureHash.randomSHA256()
            )
        )
        network.runNetwork()
        val linearId = issueFuture.get().tx.outputsOfType(TradeFinanceState::class.java).single().linearId

        val clearFuture = exporterNode.startFlow(
            RegulatoryClearFlow.Initiator(linearId, ComplianceOutcome.CLEAR, "DOC-2", "WHO_GMP_CERTIFICATE", SecureHash.randomSHA256())
        )
        network.runNetwork(); clearFuture.get()

        val shipFuture = exporterNode.startFlow(
            ShipGoodsFlow.Initiator(linearId, "DOC-3", "BILL_OF_LADING", SecureHash.randomSHA256())
        )
        network.runNetwork(); shipFuture.get()

        // AcceptDocs: only the issuing bank signs. Importer, exporter and advising bank are pure observers here.
        val acceptFuture = issuingBankNode.startFlow(AcceptDocsFlow.Initiator(linearId))
        network.runNetwork(); acceptFuture.get()

        listOf(importerNode, exporterNode, advisingBankNode).forEach { observer ->
            assertEquals(TradeMilestoneStatus.ACCEPTED, latestState(observer, linearId).status)
        }

        val settleFuture = issuingBankNode.startFlow(
            SettlePaymentFlow.Initiator(linearId, "DOC-5", "MT202", SecureHash.randomSHA256())
        )
        network.runNetwork(); settleFuture.get()

        val closeFuture = importerNode.startFlow(
            RegulatoryCloseFlow.Initiator(linearId, "DOC-6", "EDPMS_CLOSURE_ENTRY", SecureHash.randomSHA256())
        )
        network.runNetwork(); closeFuture.get()

        listOf(importerNode, exporterNode, issuingBankNode, advisingBankNode).forEach { node ->
            val finalState = latestState(node, linearId)
            assertEquals(TradeMilestoneStatus.CLOSED, finalState.status)
            assertEquals(6, finalState.documentHashes.size)
            assertEquals(
                listOf("LC_TERMS", "COMPLIANCE_CERTS", "SHIPPING_DOCS", "PAYMENT_MESSAGE", "CLOSURE_FILINGS"),
                finalState.documentHashes.map { it.category }.distinct()
            )
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :workflows:test --tests "com.utfl.tradefinance.flows.FullLifecycleFlowTest"`
Expected: FAIL only if any earlier task is incomplete — if Tasks 8-10 are done, this may already pass on first run since it exercises no new production code. If so, treat Step 2's "red" as implicit and proceed directly to Step 3's confirmation run.

- [ ] **Step 3: Run test to verify it passes**

Run: `./gradlew :workflows:test --tests "com.utfl.tradefinance.flows.FullLifecycleFlowTest"`
Expected: PASS (1 test)

- [ ] **Step 4: Run the full test suite**

Run: `./gradlew test`
Expected: `BUILD SUCCESSFUL` — all contract and flow tests pass (17 contract tests + 4 flow tests + 5 type/state tests).

- [ ] **Step 5: Commit**

```bash
git add workflows/src/test/kotlin/com/utfl/tradefinance/flows/FullLifecycleFlowTest.kt
git commit -m "Add full six-milestone lifecycle test with observer visibility check"
```

---

### Task 12: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only)
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Write `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add project README"
```
