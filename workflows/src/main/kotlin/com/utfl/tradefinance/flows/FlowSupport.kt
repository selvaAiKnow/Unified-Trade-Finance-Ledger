package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.TradeFinanceState
import net.corda.core.contracts.StateAndRef
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.ReceiveFinalityFlow
import net.corda.core.flows.SignTransactionFlow
import net.corda.core.node.services.Vault
import net.corda.core.node.services.queryBy
import net.corda.core.node.services.vault.QueryCriteria
import net.corda.core.transactions.SignedTransaction
import net.corda.core.utilities.unwrap

fun FlowLogic<*>.fetchUnconsumedTradeState(linearId: UniqueIdentifier): StateAndRef<TradeFinanceState> {
    val criteria = QueryCriteria.LinearStateQueryCriteria(
        linearId = listOf(linearId),
        status = Vault.StateStatus.UNCONSUMED
    )
    return serviceHub.vaultService.queryBy<TradeFinanceState>(criteria).states.single()
}

abstract class AbstractTradeFinanceResponder(private val counterpartySession: FlowSession) : FlowLogic<Unit>() {
    @Suspendable
    override fun call() {
        val isRequiredSigner = counterpartySession.receive<Boolean>().unwrap { it }
        val txId = if (isRequiredSigner) {
            val signTransactionFlow = object : SignTransactionFlow(counterpartySession) {
                override fun checkTransaction(stx: SignedTransaction) {
                    // All business rules are enforced by TradeFinanceContract.verify().
                }
            }
            subFlow(signTransactionFlow).id
        } else {
            null
        }
        subFlow(ReceiveFinalityFlow(counterpartySession, expectedTxId = txId))
    }
}
