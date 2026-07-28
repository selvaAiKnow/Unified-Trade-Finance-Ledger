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
