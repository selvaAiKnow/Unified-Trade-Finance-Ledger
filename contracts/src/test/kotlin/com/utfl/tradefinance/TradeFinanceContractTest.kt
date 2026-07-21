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
}
