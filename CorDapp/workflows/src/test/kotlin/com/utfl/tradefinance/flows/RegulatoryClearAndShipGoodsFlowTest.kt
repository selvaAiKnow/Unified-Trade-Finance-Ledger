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
