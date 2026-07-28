package com.utfl.tradefinance

import net.corda.core.contracts.CommandData
import net.corda.core.contracts.Contract
import net.corda.core.contracts.requireSingleCommand
import net.corda.core.contracts.requireThat
import net.corda.core.identity.Party
import net.corda.core.transactions.LedgerTransaction
import java.security.PublicKey

class GuaranteeContract : Contract {
    companion object {
        const val ID = "com.utfl.tradefinance.GuaranteeContract"
    }

    interface Commands : CommandData {
        class IssueGuarantee : Commands
        class InvokeClaim : Commands
        class PayClaim : Commands
        class CloseGuarantee : Commands
    }

    override fun verify(tx: LedgerTransaction) {
        val command = tx.commands.requireSingleCommand<Commands>()
        val signers = command.signers.toSet()

        when (command.value) {
            is Commands.IssueGuarantee -> verifyIssueGuarantee(tx, signers)
            is Commands.InvokeClaim -> verifyTransition(
                tx, signers,
                fromStatus = GuaranteeMilestoneStatus.ISSUED,
                toStatus = GuaranteeMilestoneStatus.CLAIM_INVOKED,
                requiredSigners = { listOf(it.beneficiary, it.guarantorBank) },
                anchorCategory = "CLAIM_NOTICE"
            )
            is Commands.PayClaim -> verifyTransition(
                tx, signers,
                fromStatus = GuaranteeMilestoneStatus.CLAIM_INVOKED,
                toStatus = GuaranteeMilestoneStatus.CLAIM_PAID,
                requiredSigners = { listOf(it.guarantorBank) },
                anchorCategory = "PAYMENT_MESSAGE"
            )
            is Commands.CloseGuarantee -> verifyTransition(
                tx, signers,
                fromStatus = GuaranteeMilestoneStatus.CLAIM_PAID,
                toStatus = GuaranteeMilestoneStatus.CLOSED,
                requiredSigners = { listOf(it.applicant, it.guarantorBank) },
                anchorCategory = "CLOSURE_FILINGS"
            )
            else -> throw IllegalArgumentException("Unrecognised command ${command.value}")
        }
    }

    private fun verifyIssueGuarantee(tx: LedgerTransaction, signers: Set<PublicKey>) {
        val output = tx.outputsOfType<GuaranteeState>().single()
        requireThat {
            "No inputs should be consumed when issuing a guarantee" using tx.inputStates.isEmpty()
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
            "Status must be ISSUED" using (output.status == GuaranteeMilestoneStatus.ISSUED)
            "Exactly one GUARANTEE_TERMS document hash must be anchored" using (
                output.documentHashes.count {
                    it.category == "GUARANTEE_TERMS" && it.milestone == GuaranteeMilestoneStatus.ISSUED
                } == 1
            )
            "Applicant and guarantor bank must sign" using signers.containsAll(
                listOf(output.applicant.owningKey, output.guarantorBank.owningKey)
            )
        }
    }

    private fun verifyTransition(
        tx: LedgerTransaction,
        signers: Set<PublicKey>,
        fromStatus: GuaranteeMilestoneStatus,
        toStatus: GuaranteeMilestoneStatus,
        requiredSigners: (GuaranteeState) -> List<Party>,
        anchorCategory: String
    ) {
        requireThat {
            "Exactly one input state should be consumed" using (tx.inputStates.size == 1)
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
        }
        val input = tx.inputsOfType<GuaranteeState>().single()
        val output = tx.outputsOfType<GuaranteeState>().single()
        val required = requiredSigners(output)
        requireThat {
            "Input status must be $fromStatus" using (input.status == fromStatus)
            "Output status must be $toStatus" using (output.status == toStatus)
            "linearId must not change" using (input.linearId == output.linearId)
            "Parties must not change" using partiesUnchanged(input, output)
            "Required signers must sign" using signers.containsAll(required.map { it.owningKey })
            "Exactly one new $anchorCategory document hash must be anchored" using (
                output.documentHashes.size == input.documentHashes.size + 1 &&
                output.documentHashes.containsAll(input.documentHashes) &&
                output.documentHashes.count {
                    it.category == anchorCategory && it.milestone == toStatus
                } == 1
            )
        }
    }

    private fun partiesUnchanged(input: GuaranteeState, output: GuaranteeState): Boolean =
        input.applicant == output.applicant &&
        input.beneficiary == output.beneficiary &&
        input.guarantorBank == output.guarantorBank &&
        input.advisingBank == output.advisingBank
}
