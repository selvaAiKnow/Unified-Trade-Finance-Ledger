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
