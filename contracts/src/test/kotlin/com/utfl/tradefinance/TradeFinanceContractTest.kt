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
