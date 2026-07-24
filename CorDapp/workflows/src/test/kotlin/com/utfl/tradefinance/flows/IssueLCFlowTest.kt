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
