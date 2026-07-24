package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.DocumentHashRecord
import com.utfl.tradefinance.TradeFinanceContract
import com.utfl.tradefinance.TradeMilestoneStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.flows.CollectSignaturesFlow
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
import java.time.Instant

object ShipGoodsFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(
        private val linearId: UniqueIdentifier,
        private val documentId: String,
        private val documentType: String,
        private val onChainHash: SecureHash
    ) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val inputStateAndRef = fetchUnconsumedTradeState(linearId)
            val input = inputStateAndRef.state.data
            val notary = inputStateAndRef.state.notary

            val output = input.copy(
                status = TradeMilestoneStatus.SHIPPED,
                documentHashes = input.documentHashes + DocumentHashRecord(
                    documentId = documentId,
                    category = "SHIPPING_DOCS",
                    documentType = documentType,
                    onChainHash = onChainHash,
                    milestone = TradeMilestoneStatus.SHIPPED,
                    anchoredAt = Instant.now()
                )
            )

            val requiredSigners = listOf(output.exporter, output.advisingBank)

            val builder = TransactionBuilder(notary)
                .addInputState(inputStateAndRef)
                .addOutputState(output, TradeFinanceContract.ID)
                .addCommand(TradeFinanceContract.Commands.ShipGoods(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != ourIdentity }
            val sessionsByParty = counterparties.map { it to initiateFlow(it) }.toMap()
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            val signerSessions = requiredSigners.filter { it != ourIdentity }.map { sessionsByParty.getValue(it) }
            val fullySignedTx = subFlow(CollectSignaturesFlow(partiallySignedTx, signerSessions))

            return subFlow(FinalityFlow(fullySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
