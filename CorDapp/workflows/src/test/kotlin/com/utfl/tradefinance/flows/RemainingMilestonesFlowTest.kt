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
            // 5, not 6: AcceptDocs is a document-hash-neutral pure sign-off per
            // TradeFinanceContract.verifyAcceptDocs ("Document hashes must not change for a
            // pure sign-off"), and AcceptDocsFlow.Initiator takes no document parameters.
            // Hashes come from IssueLC (DOC-1), RegulatoryClear (DOC-2), ShipGoods (DOC-3),
            // SettlePayment (DOC-5) and RegulatoryClose (DOC-6) only.
            assertEquals(5, states.single().state.data.documentHashes.size)
        }
    }
}
