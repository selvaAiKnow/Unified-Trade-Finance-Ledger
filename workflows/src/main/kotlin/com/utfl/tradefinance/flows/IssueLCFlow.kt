package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.DocumentHashRecord
import com.utfl.tradefinance.TradeFinanceContract
import com.utfl.tradefinance.TradeFinanceState
import com.utfl.tradefinance.TradeMilestoneStatus
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

object IssueLCFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(
        private val issuingBank: Party,
        private val exporter: Party,
        private val advisingBank: Party,
        private val lcReference: String,
        private val lcTermsDocumentId: String,
        private val lcTermsHash: SecureHash
    ) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val importer = ourIdentity
            val notary = serviceHub.networkMapCache.notaryIdentities.first()

            val output = TradeFinanceState(
                lcReference = lcReference,
                importer = importer,
                exporter = exporter,
                issuingBank = issuingBank,
                advisingBank = advisingBank,
                lcTermsHash = lcTermsHash,
                status = TradeMilestoneStatus.LC_ISSUED,
                documentHashes = listOf(
                    DocumentHashRecord(
                        documentId = lcTermsDocumentId,
                        category = "LC_TERMS",
                        documentType = "LC_APPLICATION",
                        onChainHash = lcTermsHash,
                        milestone = TradeMilestoneStatus.LC_ISSUED,
                        anchoredAt = Instant.now()
                    )
                )
            )

            val requiredSigners = listOf(importer, issuingBank)

            val builder = TransactionBuilder(notary)
                .addOutputState(output, TradeFinanceContract.ID)
                .addCommand(TradeFinanceContract.Commands.IssueLC(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != importer }
            val sessionsByParty = counterparties.map { it to initiateFlow(it) }.toMap()
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            val signerSessions = requiredSigners.filter { it != importer }.map { sessionsByParty.getValue(it) }
            val fullySignedTx = subFlow(CollectSignaturesFlow(partiallySignedTx, signerSessions))

            return subFlow(FinalityFlow(fullySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
