package com.utfl.tradefinance.flows

import co.paralleluniverse.fibers.Suspendable
import com.utfl.tradefinance.GuaranteeContract
import com.utfl.tradefinance.GuaranteeDocumentHashRecord
import com.utfl.tradefinance.GuaranteeMilestoneStatus
import com.utfl.tradefinance.GuaranteeState
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

object IssueGuaranteeFlow {

    @InitiatingFlow
    @StartableByRPC
    class Initiator(
        private val guarantorBank: Party,
        private val beneficiary: Party,
        private val advisingBank: Party,
        private val guaranteeReference: String,
        private val guaranteeTermsDocumentId: String,
        private val guaranteeTermsHash: SecureHash
    ) : FlowLogic<SignedTransaction>() {
        override val progressTracker = ProgressTracker()

        @Suspendable
        override fun call(): SignedTransaction {
            val applicant = ourIdentity
            val notary = serviceHub.networkMapCache.notaryIdentities.first()

            val output = GuaranteeState(
                guaranteeReference = guaranteeReference,
                applicant = applicant,
                beneficiary = beneficiary,
                guarantorBank = guarantorBank,
                advisingBank = advisingBank,
                guaranteeTermsHash = guaranteeTermsHash,
                status = GuaranteeMilestoneStatus.ISSUED,
                documentHashes = listOf(
                    GuaranteeDocumentHashRecord(
                        documentId = guaranteeTermsDocumentId,
                        category = "GUARANTEE_TERMS",
                        documentType = "GUARANTEE_APPLICATION",
                        onChainHash = guaranteeTermsHash,
                        milestone = GuaranteeMilestoneStatus.ISSUED,
                        anchoredAt = Instant.now()
                    )
                )
            )

            val requiredSigners = listOf(applicant, guarantorBank)

            val builder = TransactionBuilder(notary)
                .addOutputState(output, GuaranteeContract.ID)
                .addCommand(GuaranteeContract.Commands.IssueGuarantee(), requiredSigners.map { it.owningKey })
            builder.verify(serviceHub)
            val partiallySignedTx = serviceHub.signInitialTransaction(builder)

            val counterparties = output.participants.map { it as Party }.filter { it != applicant }
            val sessionsByParty = counterparties.map { it to initiateFlow(it) }.toMap()
            sessionsByParty.forEach { (party, session) -> session.send(party in requiredSigners) }

            val signerSessions = requiredSigners.filter { it != applicant }.map { sessionsByParty.getValue(it) }
            val fullySignedTx = subFlow(CollectSignaturesFlow(partiallySignedTx, signerSessions))

            return subFlow(FinalityFlow(fullySignedTx, sessionsByParty.values.toList()))
        }
    }

    @InitiatedBy(Initiator::class)
    class Responder(counterpartySession: FlowSession) : AbstractTradeFinanceResponder(counterpartySession)
}
