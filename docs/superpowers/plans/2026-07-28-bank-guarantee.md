# Bank Guarantee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, independent trade-finance instrument — Bank
Guarantee — to the CorDapp and `blockchain-layer`, proving the platform's
model can hold more than one instrument without touching the existing,
already-proven Letter of Credit contract at all.

**Architecture:** A wholly separate `GuaranteeState`/`GuaranteeContract`
pair (own milestone enum, own document-hash record type, own commands),
reusing the existing 4 Corda parties in new roles and the genuinely
instrument-agnostic `AbstractTradeFinanceResponder`. A parallel
`GuaranteeGateway`/`RealGuaranteeGateway`/`FakeGuaranteeGateway` at the
`blockchain-layer` REST layer, sharing the same `RpcConnections` and
directly reusing the bank-pool routing helpers (`resolveBank`,
`requireKnownBank`, `requireTradeOnBank`) already built for multi-bank
onboarding.

**Tech Stack:** Kotlin 1.2.71 (CorDapp `contracts`/`workflows`, unchanged),
Corda 4.10, `MockServices`/`ledgerServices.ledger{}` contract tests,
`MockNetwork` flow tests, Kotlin 1.9.24/Ktor 2.3.12/JDK 17
(`blockchain-layer`, unchanged tooling).

## Global Constraints

- **Zero changes to `TradeFinanceState`/`TradeFinanceContract`/
  `TradeMilestoneStatus`/`DocumentHashRecord`** or any existing LC flow.
  Every new type is a parallel, independent Guarantee-specific type.
- **Lifecycle:** `ISSUED → CLAIM_INVOKED → CLAIM_PAID → CLOSED`, a single
  linear happy path — no unclaimed-expiry, amendment, or dispute path.
- **Parties:** reuse the existing 4 Corda parties — `Importer`→applicant,
  `Exporter`→beneficiary, `IssuingBank`→guarantor bank, `AdvisingBank`→
  advising bank. No new Corda nodes.
- **Scope:** CorDapp/`blockchain-layer` only. No `api`, `web`, or
  `ledger-monitoring` changes.
- **`pay-claim`'s `guarantorBank` field is optional**, defaulting to
  `"IssuingBank"` when omitted, reusing `DEFAULT_ISSUING_BANK`,
  `resolveBank`, `requireKnownBank`, `requireTradeOnBank` exactly as they
  exist today in `RealCordaGateway.kt` — no changes to their logic, only
  one small promotion (`resolveParty`, private → top-level `internal`, no
  behavior change) to enable reuse.
- **JUnit gotcha to avoid** (discovered the hard way in the prior
  multi-bank-onboarding plan): an expression-bodied `@Test fun ... =
  runBlocking { ... }` whose last statement returns a non-`Unit` value
  (e.g. a helper's return value) gets its return type inferred as that
  type, and JUnit Jupiter **silently drops non-`Unit` `@Test` methods from
  discovery with no build failure**. Every `@Test` method in this plan
  that ends with a call returning something other than `Unit` has an
  explicit trailing `Unit` (or an assertion, which returns `Unit`) to avoid
  this — already applied everywhere below; keep it that way if you touch
  these files.

---

### Task 1: Guarantee types and contract (CorDapp `contracts` module)

**Files:**
- Create: `CorDapp/contracts/src/main/kotlin/com/utfl/tradefinance/GuaranteeMilestoneStatus.kt`
- Create: `CorDapp/contracts/src/main/kotlin/com/utfl/tradefinance/GuaranteeDocumentHashRecord.kt`
- Create: `CorDapp/contracts/src/main/kotlin/com/utfl/tradefinance/GuaranteeState.kt`
- Create: `CorDapp/contracts/src/main/kotlin/com/utfl/tradefinance/GuaranteeContract.kt`
- Test: `CorDapp/contracts/src/test/kotlin/com/utfl/tradefinance/GuaranteeContractTest.kt`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GuaranteeState`, `GuaranteeContract` (with `ID` and
  `Commands.{IssueGuarantee,InvokeClaim,PayClaim,CloseGuarantee}`),
  `GuaranteeMilestoneStatus`, `GuaranteeDocumentHashRecord` — consumed by
  Task 2/3's workflows and Task 4's blockchain-layer DTOs.

- [ ] **Step 1: Create `GuaranteeMilestoneStatus.kt`**

```kotlin
package com.utfl.tradefinance

import net.corda.core.serialization.CordaSerializable

@CordaSerializable
enum class GuaranteeMilestoneStatus {
    ISSUED,
    CLAIM_INVOKED,
    CLAIM_PAID,
    CLOSED
}
```

- [ ] **Step 2: Create `GuaranteeDocumentHashRecord.kt`**

```kotlin
package com.utfl.tradefinance

import net.corda.core.crypto.SecureHash
import net.corda.core.serialization.CordaSerializable
import java.time.Instant

@CordaSerializable
data class GuaranteeDocumentHashRecord(
    val documentId: String,
    val category: String,
    val documentType: String,
    val onChainHash: SecureHash,
    val milestone: GuaranteeMilestoneStatus,
    val anchoredAt: Instant
)
```

This cannot reuse the existing `DocumentHashRecord`: that type's
`milestone` field is hard-typed to `TradeMilestoneStatus` (the LC-specific
enum), so it can't hold a `GuaranteeMilestoneStatus` value.

- [ ] **Step 3: Create `GuaranteeState.kt`**

```kotlin
package com.utfl.tradefinance

import net.corda.core.contracts.BelongsToContract
import net.corda.core.contracts.LinearState
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.identity.AbstractParty
import net.corda.core.identity.Party
import net.corda.core.serialization.CordaSerializable

@CordaSerializable
@BelongsToContract(GuaranteeContract::class)
data class GuaranteeState(
    val guaranteeReference: String,
    val applicant: Party,
    val beneficiary: Party,
    val guarantorBank: Party,
    val advisingBank: Party,
    val guaranteeTermsHash: SecureHash,
    val status: GuaranteeMilestoneStatus,
    val documentHashes: List<GuaranteeDocumentHashRecord> = emptyList(),
    override val linearId: UniqueIdentifier = UniqueIdentifier()
) : LinearState {
    override val participants: List<AbstractParty>
        get() = listOf(applicant, beneficiary, guarantorBank, advisingBank)
}
```

- [ ] **Step 4: Create `GuaranteeContract.kt`**

```kotlin
package com.utfl.tradefinance

import net.corda.core.contracts.CommandData
import net.corda.core.contracts.Contract
import net.corda.core.contracts.requireSingleCommand
import net.corda.core.contracts.requireThat
import net.corda.core.identity.Party
import net.corda.core.transactions.LedgerTransaction
import java.security.PublicKey

class GuaranteeContract : Contract {
    companion object {
        const val ID = "com.utfl.tradefinance.GuaranteeContract"
    }

    interface Commands : CommandData {
        class IssueGuarantee : Commands
        class InvokeClaim : Commands
        class PayClaim : Commands
        class CloseGuarantee : Commands
    }

    override fun verify(tx: LedgerTransaction) {
        val command = tx.commands.requireSingleCommand<Commands>()
        val signers = command.signers.toSet()

        when (command.value) {
            is Commands.IssueGuarantee -> verifyIssueGuarantee(tx, signers)
            is Commands.InvokeClaim -> verifyTransition(
                tx, signers,
                fromStatus = GuaranteeMilestoneStatus.ISSUED,
                toStatus = GuaranteeMilestoneStatus.CLAIM_INVOKED,
                requiredSigners = { listOf(it.beneficiary, it.guarantorBank) },
                anchorCategory = "CLAIM_NOTICE"
            )
            is Commands.PayClaim -> verifyTransition(
                tx, signers,
                fromStatus = GuaranteeMilestoneStatus.CLAIM_INVOKED,
                toStatus = GuaranteeMilestoneStatus.CLAIM_PAID,
                requiredSigners = { listOf(it.guarantorBank) },
                anchorCategory = "PAYMENT_MESSAGE"
            )
            is Commands.CloseGuarantee -> verifyTransition(
                tx, signers,
                fromStatus = GuaranteeMilestoneStatus.CLAIM_PAID,
                toStatus = GuaranteeMilestoneStatus.CLOSED,
                requiredSigners = { listOf(it.applicant, it.guarantorBank) },
                anchorCategory = "CLOSURE_FILINGS"
            )
            else -> throw IllegalArgumentException("Unrecognised command ${command.value}")
        }
    }

    private fun verifyIssueGuarantee(tx: LedgerTransaction, signers: Set<PublicKey>) {
        val output = tx.outputsOfType<GuaranteeState>().single()
        requireThat {
            "No inputs should be consumed when issuing a guarantee" using tx.inputStates.isEmpty()
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
            "Status must be ISSUED" using (output.status == GuaranteeMilestoneStatus.ISSUED)
            "Exactly one GUARANTEE_TERMS document hash must be anchored" using (
                output.documentHashes.count {
                    it.category == "GUARANTEE_TERMS" && it.milestone == GuaranteeMilestoneStatus.ISSUED
                } == 1
            )
            "Applicant and guarantor bank must sign" using signers.containsAll(
                listOf(output.applicant.owningKey, output.guarantorBank.owningKey)
            )
        }
    }

    private fun verifyTransition(
        tx: LedgerTransaction,
        signers: Set<PublicKey>,
        fromStatus: GuaranteeMilestoneStatus,
        toStatus: GuaranteeMilestoneStatus,
        requiredSigners: (GuaranteeState) -> List<Party>,
        anchorCategory: String
    ) {
        requireThat {
            "Exactly one input state should be consumed" using (tx.inputStates.size == 1)
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
        }
        val input = tx.inputsOfType<GuaranteeState>().single()
        val output = tx.outputsOfType<GuaranteeState>().single()
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

    private fun partiesUnchanged(input: GuaranteeState, output: GuaranteeState): Boolean =
        input.applicant == output.applicant &&
        input.beneficiary == output.beneficiary &&
        input.guarantorBank == output.guarantorBank &&
        input.advisingBank == output.advisingBank
}
```

Note this contract needs no `AcceptDocs`-style pure-sign-off command (the
one thing `TradeFinanceContract` has that doesn't fit `verifyTransition`):
every Guarantee transition anchors exactly one new document, so
`PayClaim`/`InvokeClaim`/`CloseGuarantee` all fit the generic
`verifyTransition` helper directly — only `IssueGuarantee` needs its own
function (mirroring `verifyIssueLC`, since it has no input state).

- [ ] **Step 5: Write `GuaranteeContractTest.kt`**

```kotlin
package com.utfl.tradefinance

import net.corda.core.crypto.SecureHash
import net.corda.core.identity.CordaX500Name
import net.corda.testing.core.TestIdentity
import net.corda.testing.node.MockServices
import net.corda.testing.node.ledger
import org.junit.Test
import java.time.Instant

class GuaranteeContractTest {
    private val ledgerServices = MockServices(listOf("com.utfl.tradefinance"))

    private val applicant = TestIdentity(CordaX500Name("Importer", "Mumbai", "IN"))
    private val beneficiary = TestIdentity(CordaX500Name("Exporter", "Mumbai", "IN"))
    private val guarantorBank = TestIdentity(CordaX500Name("IssuingBank", "Tokyo", "JP"))
    private val advisingBank = TestIdentity(CordaX500Name("AdvisingBank", "Mumbai", "IN"))

    private fun issuedState(
        documentHashes: List<GuaranteeDocumentHashRecord> = listOf(
            GuaranteeDocumentHashRecord(
                documentId = "DOC-1",
                category = "GUARANTEE_TERMS",
                documentType = "GUARANTEE_APPLICATION",
                onChainHash = SecureHash.randomSHA256(),
                milestone = GuaranteeMilestoneStatus.ISSUED,
                anchoredAt = Instant.now()
            )
        )
    ) = GuaranteeState(
        guaranteeReference = "BG-2026-0001",
        applicant = applicant.party,
        beneficiary = beneficiary.party,
        guarantorBank = guarantorBank.party,
        advisingBank = advisingBank.party,
        guaranteeTermsHash = SecureHash.randomSHA256(),
        status = GuaranteeMilestoneStatus.ISSUED,
        documentHashes = documentHashes
    )

    @Test
    fun `IssueGuarantee succeeds with applicant and guarantor bank signatures and one GUARANTEE_TERMS hash`() {
        ledgerServices.ledger {
            transaction {
                output(GuaranteeContract.ID, issuedState())
                command(listOf(applicant.publicKey, guarantorBank.publicKey), GuaranteeContract.Commands.IssueGuarantee())
                verifies()
            }
        }
    }

    @Test
    fun `IssueGuarantee fails if guarantor bank signature missing`() {
        ledgerServices.ledger {
            transaction {
                output(GuaranteeContract.ID, issuedState())
                command(listOf(applicant.publicKey), GuaranteeContract.Commands.IssueGuarantee())
                fails()
            }
        }
    }

    @Test
    fun `IssueGuarantee fails if an input state is present`() {
        ledgerServices.ledger {
            transaction {
                input(GuaranteeContract.ID, issuedState())
                output(GuaranteeContract.ID, issuedState())
                command(listOf(applicant.publicKey, guarantorBank.publicKey), GuaranteeContract.Commands.IssueGuarantee())
                fails()
            }
        }
    }

    @Test
    fun `IssueGuarantee fails without a GUARANTEE_TERMS document hash`() {
        ledgerServices.ledger {
            transaction {
                output(GuaranteeContract.ID, issuedState(documentHashes = emptyList()))
                command(listOf(applicant.publicKey, guarantorBank.publicKey), GuaranteeContract.Commands.IssueGuarantee())
                fails()
            }
        }
    }

    private fun claimInvokedState(from: GuaranteeState) = from.copy(
        status = GuaranteeMilestoneStatus.CLAIM_INVOKED,
        documentHashes = from.documentHashes + GuaranteeDocumentHashRecord(
            documentId = "DOC-2",
            category = "CLAIM_NOTICE",
            documentType = "CLAIM_DEMAND",
            onChainHash = SecureHash.randomSHA256(),
            milestone = GuaranteeMilestoneStatus.CLAIM_INVOKED,
            anchoredAt = Instant.now()
        )
    )

    @Test
    fun `InvokeClaim succeeds with beneficiary and guarantor bank signatures`() {
        val input = issuedState()
        ledgerServices.ledger {
            transaction {
                input(GuaranteeContract.ID, input)
                output(GuaranteeContract.ID, claimInvokedState(input))
                command(listOf(beneficiary.publicKey, guarantorBank.publicKey), GuaranteeContract.Commands.InvokeClaim())
                verifies()
            }
        }
    }

    @Test
    fun `InvokeClaim fails if guarantor bank signature missing`() {
        val input = issuedState()
        ledgerServices.ledger {
            transaction {
                input(GuaranteeContract.ID, input)
                output(GuaranteeContract.ID, claimInvokedState(input))
                command(listOf(beneficiary.publicKey), GuaranteeContract.Commands.InvokeClaim())
                fails()
            }
        }
    }

    @Test
    fun `InvokeClaim fails if it skips a milestone (input not ISSUED)`() {
        val input = claimInvokedState(issuedState())
        val output = input.copy(status = GuaranteeMilestoneStatus.CLAIM_PAID)
        ledgerServices.ledger {
            transaction {
                input(GuaranteeContract.ID, input)
                output(GuaranteeContract.ID, output)
                command(listOf(beneficiary.publicKey, guarantorBank.publicKey), GuaranteeContract.Commands.InvokeClaim())
                fails()
            }
        }
    }

    private fun claimPaidState(from: GuaranteeState) = from.copy(
        status = GuaranteeMilestoneStatus.CLAIM_PAID,
        documentHashes = from.documentHashes + GuaranteeDocumentHashRecord(
            documentId = "DOC-3",
            category = "PAYMENT_MESSAGE",
            documentType = "MT760",
            onChainHash = SecureHash.randomSHA256(),
            milestone = GuaranteeMilestoneStatus.CLAIM_PAID,
            anchoredAt = Instant.now()
        )
    )

    @Test
    fun `PayClaim succeeds with only the guarantor bank signature`() {
        val input = claimInvokedState(issuedState())
        ledgerServices.ledger {
            transaction {
                input(GuaranteeContract.ID, input)
                output(GuaranteeContract.ID, claimPaidState(input))
                command(listOf(guarantorBank.publicKey), GuaranteeContract.Commands.PayClaim())
                verifies()
            }
        }
    }

    @Test
    fun `PayClaim fails without a new PAYMENT_MESSAGE hash`() {
        val input = claimInvokedState(issuedState())
        val output = input.copy(status = GuaranteeMilestoneStatus.CLAIM_PAID)
        ledgerServices.ledger {
            transaction {
                input(GuaranteeContract.ID, input)
                output(GuaranteeContract.ID, output)
                command(listOf(guarantorBank.publicKey), GuaranteeContract.Commands.PayClaim())
                fails()
            }
        }
    }

    @Test
    fun `CloseGuarantee succeeds with applicant and guarantor bank signatures`() {
        val input = claimPaidState(claimInvokedState(issuedState()))
        val output = input.copy(
            status = GuaranteeMilestoneStatus.CLOSED,
            documentHashes = input.documentHashes + GuaranteeDocumentHashRecord(
                documentId = "DOC-4",
                category = "CLOSURE_FILINGS",
                documentType = "GUARANTEE_CLOSURE_ENTRY",
                onChainHash = SecureHash.randomSHA256(),
                milestone = GuaranteeMilestoneStatus.CLOSED,
                anchoredAt = Instant.now()
            )
        )
        ledgerServices.ledger {
            transaction {
                input(GuaranteeContract.ID, input)
                output(GuaranteeContract.ID, output)
                command(listOf(applicant.publicKey, guarantorBank.publicKey), GuaranteeContract.Commands.CloseGuarantee())
                verifies()
            }
        }
    }

    @Test
    fun `CloseGuarantee fails if applicant signature missing`() {
        val input = claimPaidState(claimInvokedState(issuedState()))
        val output = input.copy(
            status = GuaranteeMilestoneStatus.CLOSED,
            documentHashes = input.documentHashes + GuaranteeDocumentHashRecord(
                documentId = "DOC-4",
                category = "CLOSURE_FILINGS",
                documentType = "GUARANTEE_CLOSURE_ENTRY",
                onChainHash = SecureHash.randomSHA256(),
                milestone = GuaranteeMilestoneStatus.CLOSED,
                anchoredAt = Instant.now()
            )
        )
        ledgerServices.ledger {
            transaction {
                input(GuaranteeContract.ID, input)
                output(GuaranteeContract.ID, output)
                command(listOf(guarantorBank.publicKey), GuaranteeContract.Commands.CloseGuarantee())
                fails()
            }
        }
    }
}
```

- [ ] **Step 6: Run the contract tests**

From `CorDapp/` (JDK 8 — `JAVA_HOME` at `C:\Program Files\Eclipse
Adoptium\jdk-8.0.492.9-hotspot`, established earlier in this project):

```bash
./gradlew :contracts:test --tests "com.utfl.tradefinance.GuaranteeContractTest"
```

Expected: PASS (10 tests).

- [ ] **Step 7: Republish `contracts` to Maven local**

```bash
./gradlew :contracts:publishToMavenLocal
```

This refreshes the local Maven cache so `blockchain-layer` (a separate
Gradle build) can later see the new `GuaranteeState`/`GuaranteeContract`
classes. `workflows` isn't republished yet — that happens in Task 3, after
its own new classes exist.

- [ ] **Step 8: Commit**

```bash
git add CorDapp/contracts/src/main/kotlin/com/utfl/tradefinance/GuaranteeMilestoneStatus.kt \
        CorDapp/contracts/src/main/kotlin/com/utfl/tradefinance/GuaranteeDocumentHashRecord.kt \
        CorDapp/contracts/src/main/kotlin/com/utfl/tradefinance/GuaranteeState.kt \
        CorDapp/contracts/src/main/kotlin/com/utfl/tradefinance/GuaranteeContract.kt \
        CorDapp/contracts/src/test/kotlin/com/utfl/tradefinance/GuaranteeContractTest.kt
git commit -m "Add GuaranteeState/GuaranteeContract as a second, independent trade-finance instrument"
```

---

### Task 2: Issue and invoke-claim flows (CorDapp `workflows` module)

**Files:**
- Modify: `CorDapp/workflows/src/main/kotlin/com/utfl/tradefinance/flows/FlowSupport.kt`
- Create: `CorDapp/workflows/src/main/kotlin/com/utfl/tradefinance/flows/IssueGuaranteeFlow.kt`
- Create: `CorDapp/workflows/src/main/kotlin/com/utfl/tradefinance/flows/InvokeClaimFlow.kt`
- Test: `CorDapp/workflows/src/test/kotlin/com/utfl/tradefinance/flows/IssueAndInvokeClaimFlowTest.kt`

**Interfaces:**
- Consumes: `GuaranteeState`/`GuaranteeContract`/`GuaranteeMilestoneStatus`/
  `GuaranteeDocumentHashRecord` (Task 1), `AbstractTradeFinanceResponder`
  (existing, unchanged, in `FlowSupport.kt`).
- Produces: `IssueGuaranteeFlow.Initiator`, `InvokeClaimFlow.Initiator` —
  consumed by Task 3's flows (same lifecycle) and Task 5's
  `RealGuaranteeGateway`.

- [ ] **Step 1: Add `fetchUnconsumedGuaranteeState` to `FlowSupport.kt`**

Add this import to the top of `FlowSupport.kt`, alongside the existing
`com.utfl.tradefinance.TradeFinanceState` import:

```kotlin
import com.utfl.tradefinance.GuaranteeState
```

Add this function anywhere in the file (e.g. right after the existing
`fetchUnconsumedTradeState`) — purely additive, the existing function and
`AbstractTradeFinanceResponder` are untouched:

```kotlin
fun FlowLogic<*>.fetchUnconsumedGuaranteeState(linearId: UniqueIdentifier): StateAndRef<GuaranteeState> {
    val criteria = QueryCriteria.LinearStateQueryCriteria(
        linearId = listOf(linearId),
        status = Vault.StateStatus.UNCONSUMED
    )
    return serviceHub.vaultService.queryBy<GuaranteeState>(criteria).states.single()
}
```

- [ ] **Step 2: Create `IssueGuaranteeFlow.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.GuaranteeContract
import com.utfl.tradefinance.GuaranteeDocumentHashRecord
import com.utfl.tradefinance.GuaranteeMilestoneStatus
import com.utfl.tradefinance.GuaranteeState
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

object IssueGuaranteeFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(
        private val guarantorBank: Party,
        private val beneficiary: Party,
        private val advisingBank: Party,
        private val guaranteeReference: String,
        private val guaranteeTermsDocumentId: String,
        private val guaranteeTermsHash: SecureHash
    ) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val applicant = ourIdentity
            val notary = serviceHub.networkMapCache.notaryIdentities.first()

            val output = GuaranteeState(
                guaranteeReference = guaranteeReference,
                applicant = applicant,
                beneficiary = beneficiary,
                guarantorBank = guarantorBank,
                advisingBank = advisingBank,
                guaranteeTermsHash = guaranteeTermsHash,
                status = GuaranteeMilestoneStatus.ISSUED,
                documentHashes = listOf(
                    GuaranteeDocumentHashRecord(
                        documentId = guaranteeTermsDocumentId,
                        category = "GUARANTEE_TERMS",
                        documentType = "GUARANTEE_APPLICATION",
                        onChainHash = guaranteeTermsHash,
                        milestone = GuaranteeMilestoneStatus.ISSUED,
                        anchoredAt = Instant.now()
                    )
                )
            )

            val requiredSigners = listOf(applicant, guarantorBank)

            val builder = TransactionBuilder(notary)
                .addOutputState(output, GuaranteeContract.ID)
                .addCommand(GuaranteeContract.Commands.IssueGuarantee(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != applicant }
            val sessionsByParty = counterparties.map { it to initiateFlow(it) }.toMap()
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            val signerSessions = requiredSigners.filter { it != applicant }.map { sessionsByParty.getValue(it) }
            val fullySignedTx = subFlow(CollectSignaturesFlow(partiallySignedTx, signerSessions))

            return subFlow(FinalityFlow(fullySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
```

- [ ] **Step 3: Create `InvokeClaimFlow.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.GuaranteeContract
import com.utfl.tradefinance.GuaranteeDocumentHashRecord
import com.utfl.tradefinance.GuaranteeMilestoneStatus
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

object InvokeClaimFlow {

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
            val inputStateAndRef = fetchUnconsumedGuaranteeState(linearId)
            val input = inputStateAndRef.state.data
            val notary = inputStateAndRef.state.notary

            val output = input.copy(
                status = GuaranteeMilestoneStatus.CLAIM_INVOKED,
                documentHashes = input.documentHashes + GuaranteeDocumentHashRecord(
                    documentId = documentId,
                    category = "CLAIM_NOTICE",
                    documentType = documentType,
                    onChainHash = onChainHash,
                    milestone = GuaranteeMilestoneStatus.CLAIM_INVOKED,
                    anchoredAt = Instant.now()
                )
            )

            val requiredSigners = listOf(output.beneficiary, output.guarantorBank)

            val builder = TransactionBuilder(notary)
                .addInputState(inputStateAndRef)
                .addOutputState(output, GuaranteeContract.ID)
                .addCommand(GuaranteeContract.Commands.InvokeClaim(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != ourIdentity }
            val sessionsByParty = counterparties.map { it to initiateFlow(it) }.toMap()
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

- [ ] **Step 4: Write `IssueAndInvokeClaimFlowTest.kt`**

Reuses the existing `AbstractFlowTest` base class unchanged — it already
registers both the `com.utfl.tradefinance` and `com.utfl.tradefinance.flows`
CorDapp packages and creates the same 4 party nodes these flows need.

```kotlin
package com.utfl.tradefinance.flows

import com.utfl.tradefinance.GuaranteeMilestoneStatus
import com.utfl.tradefinance.GuaranteeState
import net.corda.core.crypto.SecureHash
import net.corda.core.node.services.Vault
import net.corda.core.node.services.queryBy
import net.corda.core.node.services.vault.QueryCriteria
import org.junit.Test
import kotlin.test.assertEquals

class IssueAndInvokeClaimFlowTest : AbstractFlowTest() {
    @Test
    fun `IssueGuarantee finalizes on all four nodes`() {
        val flow = IssueGuaranteeFlow.Initiator(
            guarantorBank = issuingBankNode.info.legalIdentities[0],
            beneficiary = exporterNode.info.legalIdentities[0],
            advisingBank = advisingBankNode.info.legalIdentities[0],
            guaranteeReference = "BG-2026-0001",
            guaranteeTermsDocumentId = "DOC-1",
            guaranteeTermsHash = SecureHash.randomSHA256()
        )
        val future = importerNode.startFlow(flow)
        network.runNetwork()
        val stx = future.get()

        listOf(importerNode, exporterNode, issuingBankNode, advisingBankNode).forEach { node ->
            val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
            val states = node.services.vaultService.queryBy<GuaranteeState>(criteria).states
            assertEquals(1, states.size)
            assertEquals(GuaranteeMilestoneStatus.ISSUED, states.single().state.data.status)
            assertEquals(stx.id, states.single().ref.txhash)
        }
    }

    @Test
    fun `InvokeClaim drives the guarantee to CLAIM_INVOKED on all four nodes`() {
        val issueFlow = IssueGuaranteeFlow.Initiator(
            guarantorBank = issuingBankNode.info.legalIdentities[0],
            beneficiary = exporterNode.info.legalIdentities[0],
            advisingBank = advisingBankNode.info.legalIdentities[0],
            guaranteeReference = "BG-2026-0001",
            guaranteeTermsDocumentId = "DOC-1",
            guaranteeTermsHash = SecureHash.randomSHA256()
        )
        val issueFuture = importerNode.startFlow(issueFlow)
        network.runNetwork()
        val linearId = issueFuture.get().tx.outputsOfType(GuaranteeState::class.java).single().linearId

        val invokeFuture = exporterNode.startFlow(
            InvokeClaimFlow.Initiator(linearId, "DOC-2", "CLAIM_DEMAND", SecureHash.randomSHA256())
        )
        network.runNetwork()
        invokeFuture.get()

        listOf(importerNode, exporterNode, issuingBankNode, advisingBankNode).forEach { node ->
            val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
            val states = node.services.vaultService.queryBy<GuaranteeState>(criteria).states
            assertEquals(1, states.size)
            assertEquals(GuaranteeMilestoneStatus.CLAIM_INVOKED, states.single().state.data.status)
        }
    }
}
```

`InvokeClaimFlow` is started by `exporterNode` (the beneficiary) — in
real life, the beneficiary is the one who invokes a claim.

- [ ] **Step 5: Run the flow tests**

```bash
./gradlew :workflows:test --tests "com.utfl.tradefinance.flows.IssueAndInvokeClaimFlowTest"
```

Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add CorDapp/workflows/src/main/kotlin/com/utfl/tradefinance/flows/FlowSupport.kt \
        CorDapp/workflows/src/main/kotlin/com/utfl/tradefinance/flows/IssueGuaranteeFlow.kt \
        CorDapp/workflows/src/main/kotlin/com/utfl/tradefinance/flows/InvokeClaimFlow.kt \
        CorDapp/workflows/src/test/kotlin/com/utfl/tradefinance/flows/IssueAndInvokeClaimFlowTest.kt
git commit -m "Add IssueGuaranteeFlow and InvokeClaimFlow"
```

---

### Task 3: Pay-claim and close flows (CorDapp `workflows` module)

**Files:**
- Create: `CorDapp/workflows/src/main/kotlin/com/utfl/tradefinance/flows/PayClaimFlow.kt`
- Create: `CorDapp/workflows/src/main/kotlin/com/utfl/tradefinance/flows/CloseGuaranteeFlow.kt`
- Test: `CorDapp/workflows/src/test/kotlin/com/utfl/tradefinance/flows/PayClaimAndCloseFlowTest.kt`

**Interfaces:**
- Consumes: `IssueGuaranteeFlow`, `InvokeClaimFlow`,
  `fetchUnconsumedGuaranteeState` (Task 2).
- Produces: `PayClaimFlow.Initiator`, `CloseGuaranteeFlow.Initiator` —
  consumed by Task 5's `RealGuaranteeGateway`. This completes the full
  Guarantee lifecycle.

- [ ] **Step 1: Create `PayClaimFlow.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.GuaranteeContract
import com.utfl.tradefinance.GuaranteeDocumentHashRecord
import com.utfl.tradefinance.GuaranteeMilestoneStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
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

object PayClaimFlow {

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
            val inputStateAndRef = fetchUnconsumedGuaranteeState(linearId)
            val input = inputStateAndRef.state.data
            val notary = inputStateAndRef.state.notary

            val output = input.copy(
                status = GuaranteeMilestoneStatus.CLAIM_PAID,
                documentHashes = input.documentHashes + GuaranteeDocumentHashRecord(
                    documentId = documentId,
                    category = "PAYMENT_MESSAGE",
                    documentType = documentType,
                    onChainHash = onChainHash,
                    milestone = GuaranteeMilestoneStatus.CLAIM_PAID,
                    anchoredAt = Instant.now()
                )
            )
            val requiredSigners = listOf(output.guarantorBank)

            val builder = TransactionBuilder(notary)
                .addInputState(inputStateAndRef)
                .addOutputState(output, GuaranteeContract.ID)
                .addCommand(GuaranteeContract.Commands.PayClaim(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != ourIdentity }
            val sessionsByParty = counterparties.map { it to initiateFlow(it) }.toMap()
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            return subFlow(FinalityFlow(partiallySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
```

Only the guarantor bank signs (mirrors `AcceptDocsFlow`'s single-signer
shape: the initiator IS the sole required signer, so there's no
`CollectSignaturesFlow` step — just notarize and finalize).

- [ ] **Step 2: Create `CloseGuaranteeFlow.kt`**

```kotlin
package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.GuaranteeContract
import com.utfl.tradefinance.GuaranteeDocumentHashRecord
import com.utfl.tradefinance.GuaranteeMilestoneStatus
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

object CloseGuaranteeFlow {

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
            val inputStateAndRef = fetchUnconsumedGuaranteeState(linearId)
            val input = inputStateAndRef.state.data
            val notary = inputStateAndRef.state.notary

            val output = input.copy(
                status = GuaranteeMilestoneStatus.CLOSED,
                documentHashes = input.documentHashes + GuaranteeDocumentHashRecord(
                    documentId = documentId,
                    category = "CLOSURE_FILINGS",
                    documentType = documentType,
                    onChainHash = onChainHash,
                    milestone = GuaranteeMilestoneStatus.CLOSED,
                    anchoredAt = Instant.now()
                )
            )

            val requiredSigners = listOf(output.applicant, output.guarantorBank)

            val builder = TransactionBuilder(notary)
                .addInputState(inputStateAndRef)
                .addOutputState(output, GuaranteeContract.ID)
                .addCommand(GuaranteeContract.Commands.CloseGuarantee(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != ourIdentity }
            val sessionsByParty = counterparties.map { it to initiateFlow(it) }.toMap()
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

- [ ] **Step 3: Write `PayClaimAndCloseFlowTest.kt`**

```kotlin
package com.utfl.tradefinance.flows

import com.utfl.tradefinance.GuaranteeMilestoneStatus
import com.utfl.tradefinance.GuaranteeState
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.node.services.Vault
import net.corda.core.node.services.queryBy
import net.corda.core.node.services.vault.QueryCriteria
import org.junit.Test
import kotlin.test.assertEquals

class PayClaimAndCloseFlowTest : AbstractFlowTest() {
    private fun issueAndInvokeClaim(): UniqueIdentifier {
        val issueFlow = IssueGuaranteeFlow.Initiator(
            guarantorBank = issuingBankNode.info.legalIdentities[0],
            beneficiary = exporterNode.info.legalIdentities[0],
            advisingBank = advisingBankNode.info.legalIdentities[0],
            guaranteeReference = "BG-2026-0001",
            guaranteeTermsDocumentId = "DOC-1",
            guaranteeTermsHash = SecureHash.randomSHA256()
        )
        val issueFuture = importerNode.startFlow(issueFlow)
        network.runNetwork()
        val linearId = issueFuture.get().tx.outputsOfType(GuaranteeState::class.java).single().linearId

        val invokeFuture = exporterNode.startFlow(
            InvokeClaimFlow.Initiator(linearId, "DOC-2", "CLAIM_DEMAND", SecureHash.randomSHA256())
        )
        network.runNetwork()
        invokeFuture.get()

        return linearId
    }

    @Test
    fun `PayClaim and CloseGuarantee drive the guarantee to CLOSED on all four nodes`() {
        val linearId = issueAndInvokeClaim()

        val payFuture = issuingBankNode.startFlow(
            PayClaimFlow.Initiator(linearId, "DOC-3", "MT760", SecureHash.randomSHA256())
        )
        network.runNetwork()
        payFuture.get()

        val closeFuture = importerNode.startFlow(
            CloseGuaranteeFlow.Initiator(linearId, "DOC-4", "GUARANTEE_CLOSURE_ENTRY", SecureHash.randomSHA256())
        )
        network.runNetwork()
        closeFuture.get()

        listOf(importerNode, exporterNode, issuingBankNode, advisingBankNode).forEach { node ->
            val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
            val states = node.services.vaultService.queryBy<GuaranteeState>(criteria).states
            assertEquals(1, states.size)
            assertEquals(GuaranteeMilestoneStatus.CLOSED, states.single().state.data.status)
            // 4, not fewer: unlike TradeFinanceContract's AcceptDocs (a document-hash-neutral
            // pure sign-off), every GuaranteeContract transition anchors exactly one new
            // document -- DOC-1 (issue), DOC-2 (invoke-claim), DOC-3 (pay-claim), DOC-4 (close).
            assertEquals(4, states.single().state.data.documentHashes.size)
        }
    }
}
```

- [ ] **Step 4: Run the flow tests**

```bash
./gradlew :workflows:test --tests "com.utfl.tradefinance.flows.PayClaimAndCloseFlowTest"
```

Expected: PASS (1 test).

- [ ] **Step 5: Republish `contracts` and `workflows` to Maven local**

```bash
./gradlew :contracts:publishToMavenLocal :workflows:publishToMavenLocal
```

This makes every Guarantee type/flow from Tasks 1-3 visible to
`blockchain-layer`'s separate Gradle build (Tasks 4-7).

- [ ] **Step 6: Commit**

```bash
git add CorDapp/workflows/src/main/kotlin/com/utfl/tradefinance/flows/PayClaimFlow.kt \
        CorDapp/workflows/src/main/kotlin/com/utfl/tradefinance/flows/CloseGuaranteeFlow.kt \
        CorDapp/workflows/src/test/kotlin/com/utfl/tradefinance/flows/PayClaimAndCloseFlowTest.kt
git commit -m "Add PayClaimFlow and CloseGuaranteeFlow, completing the guarantee lifecycle"
```

---

### Task 4: Guarantee gateway interface and DTOs (`blockchain-layer`)

**Files:**
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/GuaranteeGateway.kt`
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/dto/GuaranteeDtos.kt`
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/CordaExceptions.kt`

**Interfaces:**
- Consumes: `FlowResult`, `DocumentHashRecordDto` (existing, in
  `CordaGateway.kt`, same package — no import needed).
- Produces: `GuaranteeGateway` interface, `GuaranteeStateDto`,
  `GuaranteeNotFoundException`, the 4 request DTOs — consumed by Task 5
  (`RealGuaranteeGateway`) and Task 6 (`FakeGuaranteeGateway`,
  `GuaranteeRoutes.kt`).

This task has no automated test of its own — it's types and an interface,
mirroring the same pattern already used for `CordaGateway.kt` itself (no
direct test; proven by what implements and calls it in later tasks).

- [ ] **Step 1: Create `GuaranteeGateway.kt`**

```kotlin
package com.utfl.blockchainlayer.corda

import kotlinx.serialization.Serializable

@Serializable
data class GuaranteeStateDto(
    val linearId: String,
    val guaranteeReference: String,
    val applicant: String,
    val beneficiary: String,
    val guarantorBank: String,
    val advisingBank: String,
    val guaranteeTermsHash: String,
    val status: String,
    val documentHashes: List<DocumentHashRecordDto>
)

interface GuaranteeGateway {
    fun issueGuarantee(
        beneficiary: String,
        guarantorBank: String,
        advisingBank: String,
        guaranteeReference: String,
        guaranteeTermsDocumentId: String,
        guaranteeTermsHash: String
    ): FlowResult

    fun invokeClaim(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun payClaim(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String,
        guarantorBank: String? = null
    ): FlowResult

    fun closeGuarantee(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun getGuarantee(linearId: String): GuaranteeStateDto

    fun listGuarantees(): List<GuaranteeStateDto>
}
```

- [ ] **Step 2: Create `GuaranteeDtos.kt`**

```kotlin
package com.utfl.blockchainlayer.dto

import kotlinx.serialization.Serializable

@Serializable
data class IssueGuaranteeRequest(
    val beneficiary: String,
    val guarantorBank: String,
    val advisingBank: String,
    val guaranteeReference: String,
    val guaranteeTermsDocumentId: String,
    val guaranteeTermsHash: String
)

@Serializable
data class InvokeClaimRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)

@Serializable
data class PayClaimRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String,
    val guarantorBank: String? = null
)

@Serializable
data class CloseGuaranteeRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)
```

`FlowResultResponse` (the response body for all 4 flow-trigger endpoints)
is already generic and reused as-is — no new response DTO needed.

- [ ] **Step 3: Add `GuaranteeNotFoundException` to `CordaExceptions.kt`**

Add this line to the existing file, alongside `TradeNotFoundException`:

```kotlin
class GuaranteeNotFoundException(linearId: String) : RuntimeException("No guarantee found with linearId=$linearId")
```

- [ ] **Step 4: Verify it compiles**

```bash
cd CorDapp/blockchain-layer && ./gradlew compileKotlin
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/GuaranteeGateway.kt \
        CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/dto/GuaranteeDtos.kt \
        CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/CordaExceptions.kt
git commit -m "Add GuaranteeGateway interface, DTOs, and GuaranteeNotFoundException"
```

---

### Task 5: RealGuaranteeGateway implementation (`blockchain-layer`)

**Files:**
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RealCordaGateway.kt`
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RealGuaranteeGateway.kt`

**Interfaces:**
- Consumes: `GuaranteeGateway`, `GuaranteeStateDto` (Task 4);
  `IssueGuaranteeFlow`, `InvokeClaimFlow`, `PayClaimFlow`,
  `CloseGuaranteeFlow` (Tasks 2-3); `resolveBank`, `requireKnownBank`,
  `requireTradeOnBank`, `runRpc`, `DEFAULT_ISSUING_BANK` (existing
  top-level functions/constant in `RealCordaGateway.kt`, unchanged).
- Produces: `RealGuaranteeGateway` — consumed by Task 6's `Application.kt`
  wiring.

This task has no automated test of its own — same reasoning as
`RealCordaGateway` itself: constructing a real `RpcConnections` requires a
live Corda RPC connection. Proven by Task 7's live integration test.

- [ ] **Step 1: Promote `resolveParty` to a top-level `internal` function**

In `RealCordaGateway.kt`, `resolveParty` is currently a `private fun`
member of the `RealCordaGateway` class. `RealGuaranteeGateway` needs the
exact same party-resolution logic, and duplicating it would violate this
plan's "reuse what's truly generic" principle (the same reasoning already
applied to `resolveBank`/`requireKnownBank`/`requireTradeOnBank`/`runRpc`,
all already top-level `internal` functions in this file). This is a pure
move with no logic change — Kotlin resolves an unqualified call to a
top-level function in the same file identically to a call to a private
member, so the one existing call site (`resolveParty(ops, exporter)` etc.
inside `issueLC`) needs no changes.

Remove this from inside the `RealCordaGateway` class body:

```kotlin
    private fun resolveParty(ops: CordaRPCOps, commonName: String): Party {
        val x500Name = ops.networkMapSnapshot()
            .flatMap { it.legalIdentities }
            .firstOrNull { it.name.organisation == commonName }
            ?: throw FlowRejectedException("Unknown party '$commonName'")
        return x500Name
    }
```

Add this at the bottom of the file, alongside `runRpc`/`resolveBank`/
`requireKnownBank`/`requireTradeOnBank`:

```kotlin
// Resolves any party visible on the Corda network map by its X.500 organisation name --
// broader than resolveBank/connections.banks (which only covers blockchain-layer's own
// RPC-connected bank pool). Promoted to top-level so RealGuaranteeGateway can reuse it too,
// rather than duplicating the same lookup.
internal fun resolveParty(ops: CordaRPCOps, commonName: String): Party {
    val x500Name = ops.networkMapSnapshot()
        .flatMap { it.legalIdentities }
        .firstOrNull { it.name.organisation == commonName }
        ?: throw FlowRejectedException("Unknown party '$commonName'")
    return x500Name
}
```

- [ ] **Step 2: Verify `RealCordaGateway.kt` still compiles unchanged in behavior**

```bash
cd CorDapp/blockchain-layer && ./gradlew test
```

Expected: PASS, same test count as before this task (this is a pure move,
no test assertions should change).

- [ ] **Step 3: Create `RealGuaranteeGateway.kt`**

```kotlin
package com.utfl.blockchainlayer.corda

import com.utfl.tradefinance.GuaranteeDocumentHashRecord
import com.utfl.tradefinance.GuaranteeState
import com.utfl.tradefinance.flows.CloseGuaranteeFlow
import com.utfl.tradefinance.flows.InvokeClaimFlow
import com.utfl.tradefinance.flows.IssueGuaranteeFlow
import com.utfl.tradefinance.flows.PayClaimFlow
import net.corda.core.contracts.StateAndRef
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.messaging.CordaRPCOps
import net.corda.core.messaging.vaultQueryBy
import net.corda.core.node.services.Vault
import net.corda.core.node.services.vault.QueryCriteria
import net.corda.core.transactions.SignedTransaction
import net.corda.core.utilities.getOrThrow

class RealGuaranteeGateway(private val connections: RpcConnections) : GuaranteeGateway {

    override fun issueGuarantee(
        beneficiary: String,
        guarantorBank: String,
        advisingBank: String,
        guaranteeReference: String,
        guaranteeTermsDocumentId: String,
        guaranteeTermsHash: String
    ): FlowResult {
        val ops = connections.importer
        val beneficiaryParty = resolveParty(ops, beneficiary)
        val guarantorBankParty = resolveParty(ops, guarantorBank)
        val advisingBankParty = resolveParty(ops, advisingBank)
        // Same reasoning as issueLC in RealCordaGateway.kt: guarantorBank must be a bank
        // blockchain-layer actually has an RPC connection for, not merely a party that exists
        // on the Corda network map -- otherwise pay-claim would permanently fail for this
        // guarantee with "Unknown bank: <name>".
        requireKnownBank(connections.banks, guarantorBank)

        val stx = runRpc {
            ops.startFlowDynamic(
                IssueGuaranteeFlow.Initiator::class.java,
                guarantorBankParty,
                beneficiaryParty,
                advisingBankParty,
                guaranteeReference,
                guaranteeTermsDocumentId,
                SecureHash.parse(guaranteeTermsHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun invokeClaim(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.exporter
        val stx = runRpc {
            ops.startFlowDynamic(
                InvokeClaimFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun payClaim(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String,
        guarantorBank: String?
    ): FlowResult {
        val bankName = guarantorBank ?: DEFAULT_ISSUING_BANK
        val ops = resolveBank(connections.banks, guarantorBank)
        // UniqueIdentifier.fromString stays outside runRpc/requireTradeOnBank so a malformed
        // linearId still surfaces as its own 400, mirroring acceptDocs/settlePayment.
        val id = UniqueIdentifier.fromString(linearId)
        requireTradeOnBank(runRpc { queryOneGuarantee(ops, id) }, linearId, bankName)
        val stx = runRpc {
            ops.startFlowDynamic(
                PayClaimFlow.Initiator::class.java,
                id,
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun closeGuarantee(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.importer
        val stx = runRpc {
            ops.startFlowDynamic(
                CloseGuaranteeFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun getGuarantee(linearId: String): GuaranteeStateDto {
        val id = UniqueIdentifier.fromString(linearId)
        val stateAndRef = runRpc { queryOneGuarantee(connections.importer, id) }
            ?: throw GuaranteeNotFoundException(linearId)
        return toDto(stateAndRef)
    }

    override fun listGuarantees(): List<GuaranteeStateDto> {
        val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
        return runRpc { connections.importer.vaultQueryBy<GuaranteeState>(criteria).states.map { toDto(it) } }
    }

    private fun queryOneGuarantee(ops: CordaRPCOps, linearId: UniqueIdentifier): StateAndRef<GuaranteeState>? {
        val criteria = QueryCriteria.LinearStateQueryCriteria(
            linearId = listOf(linearId),
            status = Vault.StateStatus.UNCONSUMED
        )
        return ops.vaultQueryBy<GuaranteeState>(criteria).states.singleOrNull()
    }

    private fun toFlowResult(stx: SignedTransaction): FlowResult {
        val state = stx.tx.outputsOfType<GuaranteeState>().single()
        return FlowResult(
            linearId = state.linearId.id.toString(),
            txId = stx.id.toString(),
            status = state.status.name
        )
    }

    private fun toDto(stateAndRef: StateAndRef<GuaranteeState>): GuaranteeStateDto {
        val state = stateAndRef.state.data
        return GuaranteeStateDto(
            linearId = state.linearId.id.toString(),
            guaranteeReference = state.guaranteeReference,
            applicant = state.applicant.name.organisation,
            beneficiary = state.beneficiary.name.organisation,
            guarantorBank = state.guarantorBank.name.organisation,
            advisingBank = state.advisingBank.name.organisation,
            guaranteeTermsHash = state.guaranteeTermsHash.toString(),
            status = state.status.name,
            documentHashes = state.documentHashes.map { toDto(it) }
        )
    }

    private fun toDto(record: GuaranteeDocumentHashRecord): DocumentHashRecordDto = DocumentHashRecordDto(
        documentId = record.documentId,
        category = record.category,
        documentType = record.documentType,
        onChainHash = record.onChainHash.toString(),
        milestone = record.milestone.name,
        anchoredAt = record.anchoredAt.toString()
    )
}
```

`RealGuaranteeGateway` takes the same `RpcConnections` instance
`RealCordaGateway` uses (wired together in Task 6's `Application.kt`) — no
duplicate RPC connections to the same nodes. `pay-claim` reuses the exact
multi-bank routing already proven for `accept-docs`/`settle-payment`.

- [ ] **Step 4: Verify it compiles**

```bash
./gradlew compileKotlin
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RealCordaGateway.kt \
        CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/corda/RealGuaranteeGateway.kt
git commit -m "Add RealGuaranteeGateway, reusing the multi-bank routing helpers"
```

---

### Task 6: Guarantee routes, wiring, and unit tests (`blockchain-layer`)

**Files:**
- Create: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/routes/GuaranteeRoutes.kt`
- Modify: `CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/Application.kt`
- Create: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/corda/FakeGuaranteeGateway.kt`
- Test: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/routes/GuaranteeRoutesTest.kt`
- Modify: `CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/ErrorHandlingTest.kt`

**Interfaces:**
- Consumes: `GuaranteeGateway`, `RealGuaranteeGateway` (Task 5);
  `GuaranteeGateway`'s request DTOs (Task 4).
- Produces: live `POST /flows/issue-guarantee`, `/invoke-claim`,
  `/pay-claim`, `/close-guarantee`, `GET /guarantees/{linearId}`,
  `GET /guarantees` — consumed by Task 7's live integration test.

- [ ] **Step 1: Create `GuaranteeRoutes.kt`**

```kotlin
package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.GuaranteeGateway
import com.utfl.blockchainlayer.dto.CloseGuaranteeRequest
import com.utfl.blockchainlayer.dto.InvokeClaimRequest
import com.utfl.blockchainlayer.dto.IssueGuaranteeRequest
import com.utfl.blockchainlayer.dto.PayClaimRequest
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post

fun Route.guaranteeRoutes(gateway: GuaranteeGateway) {
    post("/flows/issue-guarantee") {
        val body = call.receive<IssueGuaranteeRequest>()
        val result = gateway.issueGuarantee(
            beneficiary = body.beneficiary,
            guarantorBank = body.guarantorBank,
            advisingBank = body.advisingBank,
            guaranteeReference = body.guaranteeReference,
            guaranteeTermsDocumentId = body.guaranteeTermsDocumentId,
            guaranteeTermsHash = body.guaranteeTermsHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/invoke-claim") {
        val body = call.receive<InvokeClaimRequest>()
        val result = gateway.invokeClaim(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/pay-claim") {
        val body = call.receive<PayClaimRequest>()
        val result = gateway.payClaim(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash,
            guarantorBank = body.guarantorBank
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/close-guarantee") {
        val body = call.receive<CloseGuaranteeRequest>()
        val result = gateway.closeGuarantee(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    get("/guarantees/{linearId}") {
        val linearId = call.parameters["linearId"]!!
        val guarantee = gateway.getGuarantee(linearId)
        call.respond(HttpStatusCode.OK, guarantee)
    }

    get("/guarantees") {
        call.respond(HttpStatusCode.OK, gateway.listGuarantees())
    }
}
```

`.toResponse()` is the existing `FlowResult` → `FlowResultResponse`
extension function already defined in `FlowRoutes.kt` — visible here with
no import, since both files are in the `com.utfl.blockchainlayer.routes`
package. Do not redefine it.

- [ ] **Step 2: Wire `Application.kt`**

Change `main()`:

```kotlin
fun main() {
    val connections = RpcConfigLoader.fromEnv()
    val gateway = RealCordaGateway(connections)
    val guaranteeGateway = RealGuaranteeGateway(connections)
    embeddedServer(Netty, port = 8081, host = "0.0.0.0") { module(gateway, guaranteeGateway) }
        .start(wait = true)
}
```

Change `Application.module`'s signature and body. The new parameter is
**nullable with a default of `null`** — this is deliberate: all 16
existing test call sites across `ApplicationTest.kt`, `FlowRoutesTest.kt`,
`TradeRoutesTest.kt`, and `ErrorHandlingTest.kt` call `module(gateway)`
with one argument, and none of them need to change (they simply don't get
guarantee routes installed, which is correct — none of them test guarantee
behavior).

```kotlin
fun Application.module(gateway: CordaGateway, guaranteeGateway: GuaranteeGateway? = null) {
    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true })
    }
    install(StatusPages) {
        exception<TradeNotFoundException> { call, cause ->
            call.respond(HttpStatusCode.NotFound, ErrorResponse(cause.message ?: "Not found"))
        }
        exception<GuaranteeNotFoundException> { call, cause ->
            call.respond(HttpStatusCode.NotFound, ErrorResponse(cause.message ?: "Not found"))
        }
        exception<FlowRejectedException> { call, cause ->
            call.respond(HttpStatusCode.BadRequest, ErrorResponse(cause.message ?: "Flow rejected"))
        }
        exception<CordaConnectionException> { call, cause ->
            call.respond(HttpStatusCode.BadGateway, ErrorResponse(cause.message ?: "Corda connection failed"))
        }
        exception<IllegalArgumentException> { call, cause ->
            call.respond(HttpStatusCode.BadRequest, ErrorResponse(cause.message ?: "Invalid input"))
        }
        exception<Throwable> { call, cause ->
            call.application.log.error("Unhandled exception while processing ${call.request.local.uri}", cause)
            call.respond(HttpStatusCode.InternalServerError, ErrorResponse("Internal server error"))
        }
    }
    routing {
        get("/health") {
            call.respondText("""{"status":"ok"}""", io.ktor.http.ContentType.Application.Json)
        }
        flowRoutes(gateway)
        tradeRoutes(gateway)
        guaranteeGateway?.let { guaranteeRoutes(it) }
    }
}
```

Add these imports to `Application.kt`, alongside the existing ones:

```kotlin
import com.utfl.blockchainlayer.corda.GuaranteeGateway
import com.utfl.blockchainlayer.corda.GuaranteeNotFoundException
import com.utfl.blockchainlayer.corda.RealGuaranteeGateway
import com.utfl.blockchainlayer.routes.guaranteeRoutes
```

- [ ] **Step 3: Create `FakeGuaranteeGateway.kt`**

```kotlin
package com.utfl.blockchainlayer.corda

class FakeGuaranteeGateway : GuaranteeGateway {
    var issueGuaranteeResult: FlowResult? = null
    var issueGuaranteeError: Throwable? = null
    var lastIssueGuaranteeArgs: List<Any?>? = null

    var invokeClaimResult: FlowResult? = null
    var invokeClaimError: Throwable? = null
    var lastInvokeClaimArgs: List<Any?>? = null

    var payClaimResult: FlowResult? = null
    var payClaimError: Throwable? = null
    var lastPayClaimArgs: List<Any?>? = null

    var closeGuaranteeResult: FlowResult? = null
    var closeGuaranteeError: Throwable? = null
    var lastCloseGuaranteeArgs: List<Any?>? = null

    var guaranteeToReturn: GuaranteeStateDto? = null
    var guaranteesToReturn: List<GuaranteeStateDto> = emptyList()
    var getGuaranteeError: Throwable? = null

    override fun issueGuarantee(
        beneficiary: String,
        guarantorBank: String,
        advisingBank: String,
        guaranteeReference: String,
        guaranteeTermsDocumentId: String,
        guaranteeTermsHash: String
    ): FlowResult {
        lastIssueGuaranteeArgs = listOf(beneficiary, guarantorBank, advisingBank, guaranteeReference, guaranteeTermsDocumentId, guaranteeTermsHash)
        issueGuaranteeError?.let { throw it }
        return issueGuaranteeResult ?: error("issueGuaranteeResult not configured")
    }

    override fun invokeClaim(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        lastInvokeClaimArgs = listOf(linearId, documentId, documentType, onChainHash)
        invokeClaimError?.let { throw it }
        return invokeClaimResult ?: error("invokeClaimResult not configured")
    }

    override fun payClaim(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String,
        guarantorBank: String?
    ): FlowResult {
        lastPayClaimArgs = listOf(linearId, documentId, documentType, onChainHash, guarantorBank)
        payClaimError?.let { throw it }
        return payClaimResult ?: error("payClaimResult not configured")
    }

    override fun closeGuarantee(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        lastCloseGuaranteeArgs = listOf(linearId, documentId, documentType, onChainHash)
        closeGuaranteeError?.let { throw it }
        return closeGuaranteeResult ?: error("closeGuaranteeResult not configured")
    }

    override fun getGuarantee(linearId: String): GuaranteeStateDto {
        getGuaranteeError?.let { throw it }
        return guaranteeToReturn ?: throw GuaranteeNotFoundException(linearId)
    }

    override fun listGuarantees(): List<GuaranteeStateDto> = guaranteesToReturn
}
```

- [ ] **Step 4: Write `GuaranteeRoutesTest.kt`**

```kotlin
package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.DocumentHashRecordDto
import com.utfl.blockchainlayer.corda.FakeCordaGateway
import com.utfl.blockchainlayer.corda.FakeGuaranteeGateway
import com.utfl.blockchainlayer.corda.FlowResult
import com.utfl.blockchainlayer.corda.GuaranteeStateDto
import com.utfl.blockchainlayer.module
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

class GuaranteeRoutesTest {
    @Test
    fun `POST flows issue-guarantee calls the gateway and returns the flow result`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.issueGuaranteeResult = FlowResult(linearId = "abc-123", txId = "tx-1", status = "ISSUED")
        application { module(cordaGateway, gateway) }

        val response = client.post("/flows/issue-guarantee") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"beneficiary":"Exporter","guarantorBank":"IssuingBank","advisingBank":"AdvisingBank","guaranteeReference":"BG-2026-0001","guaranteeTermsDocumentId":"DOC-1","guaranteeTermsHash":"ABCD"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-1","status":"ISSUED"}""",
            response.bodyAsText()
        )
        assertEquals(
            listOf("Exporter", "IssuingBank", "AdvisingBank", "BG-2026-0001", "DOC-1", "ABCD"),
            gateway.lastIssueGuaranteeArgs
        )
    }

    @Test
    fun `POST flows invoke-claim calls the gateway and returns the flow result`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.invokeClaimResult = FlowResult(linearId = "abc-123", txId = "tx-2", status = "CLAIM_INVOKED")
        application { module(cordaGateway, gateway) }

        val response = client.post("/flows/invoke-claim") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"abc-123","documentId":"DOC-2","documentType":"CLAIM_DEMAND","onChainHash":"1234"}""")
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-2","status":"CLAIM_INVOKED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-2", "CLAIM_DEMAND", "1234"), gateway.lastInvokeClaimArgs)
    }

    @Test
    fun `POST flows pay-claim forwards an explicit guarantorBank to the gateway`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.payClaimResult = FlowResult(linearId = "abc-123", txId = "tx-3", status = "CLAIM_PAID")
        application { module(cordaGateway, gateway) }

        val response = client.post("/flows/pay-claim") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","documentId":"DOC-3","documentType":"MT760","onChainHash":"5678","guarantorBank":"Bank3"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-3","status":"CLAIM_PAID"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-3", "MT760", "5678", "Bank3"), gateway.lastPayClaimArgs)
    }

    @Test
    fun `POST flows pay-claim omits guarantorBank when the caller doesn't send it`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.payClaimResult = FlowResult(linearId = "abc-123", txId = "tx-3", status = "CLAIM_PAID")
        application { module(cordaGateway, gateway) }

        val response = client.post("/flows/pay-claim") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"abc-123","documentId":"DOC-3","documentType":"MT760","onChainHash":"5678"}""")
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(listOf("abc-123", "DOC-3", "MT760", "5678", null), gateway.lastPayClaimArgs)
    }

    @Test
    fun `POST flows close-guarantee calls the gateway and returns the flow result`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.closeGuaranteeResult = FlowResult(linearId = "abc-123", txId = "tx-4", status = "CLOSED")
        application { module(cordaGateway, gateway) }

        val response = client.post("/flows/close-guarantee") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"abc-123","documentId":"DOC-4","documentType":"GUARANTEE_CLOSURE_ENTRY","onChainHash":"9ABC"}""")
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-4","status":"CLOSED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-4", "GUARANTEE_CLOSURE_ENTRY", "9ABC"), gateway.lastCloseGuaranteeArgs)
    }

    private val sampleGuarantee = GuaranteeStateDto(
        linearId = "abc-123",
        guaranteeReference = "BG-2026-0001",
        applicant = "Importer",
        beneficiary = "Exporter",
        guarantorBank = "IssuingBank",
        advisingBank = "AdvisingBank",
        guaranteeTermsHash = "ABCD",
        status = "ISSUED",
        documentHashes = listOf(
            DocumentHashRecordDto(
                documentId = "DOC-1",
                category = "GUARANTEE_TERMS",
                documentType = "GUARANTEE_APPLICATION",
                onChainHash = "ABCD",
                milestone = "ISSUED",
                anchoredAt = "2026-01-01T00:00:00Z"
            )
        )
    )

    @Test
    fun `GET guarantees linearId returns the guarantee when found`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.guaranteeToReturn = sampleGuarantee
        application { module(cordaGateway, gateway) }

        val response = client.get("/guarantees/abc-123")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(
            """{"linearId":"abc-123","guaranteeReference":"BG-2026-0001","applicant":"Importer","beneficiary":"Exporter","guarantorBank":"IssuingBank","advisingBank":"AdvisingBank","guaranteeTermsHash":"ABCD","status":"ISSUED","documentHashes":[{"documentId":"DOC-1","category":"GUARANTEE_TERMS","documentType":"GUARANTEE_APPLICATION","onChainHash":"ABCD","milestone":"ISSUED","anchoredAt":"2026-01-01T00:00:00Z"}]}""",
            response.bodyAsText()
        )
    }

    @Test
    fun `GET guarantees returns all guarantees`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.guaranteesToReturn = listOf(sampleGuarantee)
        application { module(cordaGateway, gateway) }

        val response = client.get("/guarantees")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(
            """[{"linearId":"abc-123","guaranteeReference":"BG-2026-0001","applicant":"Importer","beneficiary":"Exporter","guarantorBank":"IssuingBank","advisingBank":"AdvisingBank","guaranteeTermsHash":"ABCD","status":"ISSUED","documentHashes":[{"documentId":"DOC-1","category":"GUARANTEE_TERMS","documentType":"GUARANTEE_APPLICATION","onChainHash":"ABCD","milestone":"ISSUED","anchoredAt":"2026-01-01T00:00:00Z"}]}]""",
            response.bodyAsText()
        )
    }
}
```

- [ ] **Step 5: Add a Guarantee 404 case to `ErrorHandlingTest.kt`**

Add this test to the existing file (it needs both gateways since it's
specifically testing `GuaranteeNotFoundException`'s handler; the file's 5
existing tests are untouched and still call `module(gateway)` with one
argument):

```kotlin
    @Test
    fun `unknown guarantee linearId returns 404 with an error body`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        application { module(cordaGateway, gateway) }

        val response = client.get("/guarantees/does-not-exist")

        assertEquals(HttpStatusCode.NotFound, response.status)
        assertEquals("""{"error":"No guarantee found with linearId=does-not-exist"}""", response.bodyAsText())
    }
```

Add `import com.utfl.blockchainlayer.corda.FakeGuaranteeGateway` to this
file's existing imports.

- [ ] **Step 6: Run the full unit test suite**

```bash
./gradlew test
```

Expected: PASS, all tests green (existing suite plus the new
`GuaranteeRoutesTest` cases and the new `ErrorHandlingTest` case).

- [ ] **Step 7: Commit**

```bash
git add CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/routes/GuaranteeRoutes.kt \
        CorDapp/blockchain-layer/src/main/kotlin/com/utfl/blockchainlayer/Application.kt \
        CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/corda/FakeGuaranteeGateway.kt \
        CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/routes/GuaranteeRoutesTest.kt \
        CorDapp/blockchain-layer/src/test/kotlin/com/utfl/blockchainlayer/ErrorHandlingTest.kt
git commit -m "Wire guarantee routes into Application.kt and add unit tests"
```

---

### Task 7: Live-network integration test (`blockchain-layer`)

**Files:**
- Create: `CorDapp/blockchain-layer/src/integrationTest/kotlin/com/utfl/blockchainlayer/GuaranteeLifecycleIT.kt`

**Interfaces:**
- Consumes: the full live Docker Corda network (unchanged from
  `multi-bank-onboarding` — same 8 containers, no new nodes needed since
  this slice reuses the existing 4 parties) and the guarantee REST API
  (Task 6).
- Produces: nothing consumed by other tasks — this is the plan's
  live-network proof, mirroring `FullLifecycleIT.kt`'s role for the LC
  side.

- [ ] **Step 1: Write `GuaranteeLifecycleIT.kt`**

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
private data class GuaranteeStateBody(val guarantorBank: String, val advisingBank: String)

class GuaranteeLifecycleIT {
    private val baseUrl = System.getenv("BLOCKCHAIN_LAYER_URL") ?: "http://localhost:8081"
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

    @Test
    fun `one guarantee moves through all four milestones via the real REST API`() = runBlocking {
        waitForServiceReady()
        runFullLifecycle(
            guaranteeReference = "BG-IT-0001",
            guarantorBank = "IssuingBank",
            advisingBank = "AdvisingBank",
            guarantorBankOverrideForPayClaim = null
        )
        // Explicit trailing Unit: runFullLifecycle returns String (the linearId), and an
        // expression-bodied @Test whose inferred return type isn't Unit gets silently dropped
        // from JUnit discovery with no build failure -- see this plan's Global Constraints.
        Unit
    }

    @Test
    fun `two independent guarantees against different guarantor banks both reach CLOSED concurrently`() = runBlocking {
        waitForServiceReady()

        val linearIds = awaitAll(
            async {
                runFullLifecycle(
                    guaranteeReference = "BG-IT-PairA",
                    guarantorBank = "IssuingBank",
                    advisingBank = "AdvisingBank",
                    guarantorBankOverrideForPayClaim = null
                )
            },
            async {
                runFullLifecycle(
                    guaranteeReference = "BG-IT-PairB",
                    guarantorBank = "Bank3",
                    advisingBank = "Bank4",
                    guarantorBankOverrideForPayClaim = "Bank3"
                )
            }
        )

        assertEquals(2, linearIds.distinct().size)
    }

    /**
     * Drives one guarantee through all four milestones plus a final read-back, asserting the
     * read-back's guarantorBank/advisingBank match what was requested -- proving the RPC
     * connection actually used to advance the guarantee was the one belonging to the named
     * bank, not a stale default. [guarantorBankOverrideForPayClaim] mirrors
     * FullLifecycleIT.runFullLifecycle's own issuingBankOverrideForLaterCalls: null omits the
     * field from pay-claim entirely (proving the default-to-IssuingBank path), a non-null value
     * sends it explicitly (proving routing to a non-default bank).
     */
    private suspend fun runFullLifecycle(
        guaranteeReference: String,
        guarantorBank: String,
        advisingBank: String,
        guarantorBankOverrideForPayClaim: String?
    ): String {
        val issueResponse: HttpResponse = client.post("$baseUrl/flows/issue-guarantee") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"beneficiary":"Exporter","guarantorBank":"$guarantorBank","advisingBank":"$advisingBank","guaranteeReference":"$guaranteeReference","guaranteeTermsDocumentId":"DOC-1","guaranteeTermsHash":"${sampleHash()}"}"""
            )
        }
        assertEquals(HttpStatusCode.Created, issueResponse.status)
        val issued: FlowResultBody = issueResponse.body()
        assertEquals("ISSUED", issued.status)
        val linearId = issued.linearId

        val invokeResponse = client.post("$baseUrl/flows/invoke-claim") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","documentId":"DOC-2","documentType":"CLAIM_DEMAND","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("CLAIM_INVOKED", invokeResponse.body<FlowResultBody>().status)

        val payBody = if (guarantorBankOverrideForPayClaim != null) {
            """{"linearId":"$linearId","documentId":"DOC-3","documentType":"MT760","onChainHash":"${sampleHash()}","guarantorBank":"$guarantorBankOverrideForPayClaim"}"""
        } else {
            """{"linearId":"$linearId","documentId":"DOC-3","documentType":"MT760","onChainHash":"${sampleHash()}"}"""
        }
        val payResponse = client.post("$baseUrl/flows/pay-claim") {
            contentType(ContentType.Application.Json)
            setBody(payBody)
        }
        assertEquals("CLAIM_PAID", payResponse.body<FlowResultBody>().status)

        val closeResponse = client.post("$baseUrl/flows/close-guarantee") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","documentId":"DOC-4","documentType":"GUARANTEE_CLOSURE_ENTRY","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("CLOSED", closeResponse.body<FlowResultBody>().status)

        val readResponse = client.get("$baseUrl/guarantees/$linearId")
        assertEquals(HttpStatusCode.OK, readResponse.status)
        val guarantee: GuaranteeStateBody = readResponse.body()
        assertEquals(guarantorBank, guarantee.guarantorBank)
        assertEquals(advisingBank, guarantee.advisingBank)

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

This builds and starts the full 8-container Docker Compose network (no
new nodes needed for this plan — same network `multi-bank-onboarding`
already built), polls `/health`, runs both `FullLifecycleIT` and the new
`GuaranteeLifecycleIT`, tears the network down, and propagates the exit
code.

Expected: PASS, all tests green — including
`two independent guarantees against different guarantor banks both reach
CLOSED concurrently`, which proves a guarantee issued by `Bank3` genuinely
routes `pay-claim` to `Bank3`'s RPC connection, not the default.

- [ ] **Step 3: Commit**

```bash
git add CorDapp/blockchain-layer/src/integrationTest/kotlin/com/utfl/blockchainlayer/GuaranteeLifecycleIT.kt
git commit -m "Prove the guarantee lifecycle works end to end on the live network"
```

---

### Task 8: README

**Files:**
- Modify: `CorDapp/blockchain-layer/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by other tasks — documentation only, final
  task of this plan.

- [ ] **Step 1: Add a "Bank Guarantee" section**

Add a new section after the existing "## Bank pool" section (before
"## Build and test"):

```markdown
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
```

- [ ] **Step 2: Update the "Build and test" section**

The existing `./scripts/run-integration-tests.sh` line's description
already says "runs the real end-to-end lifecycle test" — update it to
plural, since it now runs two lifecycle test classes:

Replace:

```markdown
`run-integration-tests.sh` builds and starts the full Docker Compose network,
polls `/health` until `blockchain-layer` is actually serving (not just its
container running), runs the real end-to-end lifecycle test against it, tears
the network down, and propagates the test's exit code -- this is the same check
that proves the whole system works end to end, not just each piece in
isolation.
```

With:

```markdown
`run-integration-tests.sh` builds and starts the full Docker Compose network,
polls `/health` until `blockchain-layer` is actually serving (not just its
container running), runs the real end-to-end lifecycle tests against it
(`FullLifecycleIT` for the LC instrument, `GuaranteeLifecycleIT` for the
guarantee instrument), tears the network down, and propagates the exit
code -- this is the same check that proves the whole system works end to
end, not just each piece in isolation.
```

- [ ] **Step 3: Commit**

```bash
git add CorDapp/blockchain-layer/README.md
git commit -m "Document the Bank Guarantee instrument"
```
