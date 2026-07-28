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
