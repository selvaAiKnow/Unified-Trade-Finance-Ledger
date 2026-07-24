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
            // 5, not 6: AcceptDocs is a document-hash-neutral pure sign-off per
            // TradeFinanceContract.verifyAcceptDocs ("Document hashes must not change for a
            // pure sign-off"), and AcceptDocsFlow.Initiator takes no document parameters.
            // Hashes come from IssueLC (DOC-1), RegulatoryClear (DOC-2), ShipGoods (DOC-3),
            // SettlePayment (DOC-5) and RegulatoryClose (DOC-6) only — matching the five
            // distinct categories asserted below.
            assertEquals(5, finalState.documentHashes.size)
            assertEquals(
                listOf("LC_TERMS", "COMPLIANCE_CERTS", "SHIPPING_DOCS", "PAYMENT_MESSAGE", "CLOSURE_FILINGS"),
                finalState.documentHashes.map { it.category }.distinct()
            )
        }
    }
}
