package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.TradeFinanceContract
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.flows.FinalityFlow
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.identity.Party
import net.corda.core.transactions.SignedTransaction
import net.corda.core.transactions.TransactionBuilder
import net.corda.core.utilities.ProgressTracker

object AcceptDocsFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(private val linearId: UniqueIdentifier) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val inputStateAndRef = fetchUnconsumedTradeState(linearId)
            val input = inputStateAndRef.state.data
            val notary = inputStateAndRef.state.notary

            val output = input.copy(status = TradeMilestoneStatus.ACCEPTED)
            val requiredSigners = listOf(output.issuingBank)

            val builder = TransactionBuilder(notary)
                .addInputState(inputStateAndRef)
                .addOutputState(output, TradeFinanceContract.ID)
                .addCommand(TradeFinanceContract.Commands.AcceptDocs(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != ourIdentity }
            val sessionsByParty = counterparties.map { it to initiateFlow(it) }.toMap()
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            return subFlow(FinalityFlow(partiallySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
