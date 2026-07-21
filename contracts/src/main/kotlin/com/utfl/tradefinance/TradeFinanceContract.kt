package com.utfl.tradefinance

import net.corda.core.contracts.CommandData
import net.corda.core.contracts.Contract
import net.corda.core.contracts.requireSingleCommand
import net.corda.core.contracts.requireThat
import net.corda.core.identity.Party
import net.corda.core.transactions.LedgerTransaction
import java.security.PublicKey

class TradeFinanceContract : Contract {
    companion object {
        const val ID = "com.utfl.tradefinance.TradeFinanceContract"
    }

    interface Commands : CommandData {
        class IssueLC : Commands
        class RegulatoryClear : Commands
        class ShipGoods : Commands
        class AcceptDocs : Commands
    }

    override fun verify(tx: LedgerTransaction) {
        val command = tx.commands.requireSingleCommand<Commands>()
        val signers = command.signers.toSet()

        when (command.value) {
            is Commands.IssueLC -> verifyIssueLC(tx, signers)
            is Commands.RegulatoryClear -> verifyTransition(
                tx, signers,
                fromStatus = TradeMilestoneStatus.LC_ISSUED,
                toStatus = TradeMilestoneStatus.REGULATORY_CLEARED,
                requiredSigners = { listOf(it.exporter, it.advisingBank) },
                anchorCategory = "COMPLIANCE_CERTS"
            )
            is Commands.ShipGoods -> verifyTransition(
                tx, signers,
                fromStatus = TradeMilestoneStatus.REGULATORY_CLEARED,
                toStatus = TradeMilestoneStatus.SHIPPED,
                requiredSigners = { listOf(it.exporter, it.advisingBank) },
                anchorCategory = "SHIPPING_DOCS"
            )
            is Commands.AcceptDocs -> verifyAcceptDocs(tx, signers)
            else -> throw IllegalArgumentException("Unrecognised command ${command.value}")
        }
    }

    private fun verifyIssueLC(tx: LedgerTransaction, signers: Set<PublicKey>) {
        val output = tx.outputsOfType<TradeFinanceState>().single()
        requireThat {
            "No inputs should be consumed when issuing an LC" using tx.inputStates.isEmpty()
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
            "Status must be LC_ISSUED" using (output.status == TradeMilestoneStatus.LC_ISSUED)
            "Compliance outcome must not be set at issuance" using (output.complianceOutcome == null)
            "Exactly one LC_TERMS document hash must be anchored" using (
                output.documentHashes.count {
                    it.category == "LC_TERMS" && it.milestone == TradeMilestoneStatus.LC_ISSUED
                } == 1
            )
            "Importer and issuing bank must sign" using signers.containsAll(
                listOf(output.importer.owningKey, output.issuingBank.owningKey)
            )
        }
    }

    private fun verifyTransition(
        tx: LedgerTransaction,
        signers: Set<PublicKey>,
        fromStatus: TradeMilestoneStatus,
        toStatus: TradeMilestoneStatus,
        requiredSigners: (TradeFinanceState) -> List<Party>,
        anchorCategory: String
    ) {
        requireThat {
            "Exactly one input state should be consumed" using (tx.inputStates.size == 1)
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
        }
        val input = tx.inputsOfType<TradeFinanceState>().single()
        val output = tx.outputsOfType<TradeFinanceState>().single()
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

    private fun verifyAcceptDocs(tx: LedgerTransaction, signers: Set<PublicKey>) {
        requireThat {
            "Exactly one input state should be consumed" using (tx.inputStates.size == 1)
            "Exactly one output state should be created" using (tx.outputStates.size == 1)
        }
        val input = tx.inputsOfType<TradeFinanceState>().single()
        val output = tx.outputsOfType<TradeFinanceState>().single()
        requireThat {
            "Input status must be SHIPPED" using (input.status == TradeMilestoneStatus.SHIPPED)
            "Output status must be ACCEPTED" using (output.status == TradeMilestoneStatus.ACCEPTED)
            "linearId must not change" using (input.linearId == output.linearId)
            "Parties must not change" using partiesUnchanged(input, output)
            "Document hashes must not change for a pure sign-off" using (input.documentHashes == output.documentHashes)
            "Only the issuing bank is required to sign" using signers.contains(output.issuingBank.owningKey)
        }
    }

    private fun partiesUnchanged(input: TradeFinanceState, output: TradeFinanceState): Boolean =
        input.importer == output.importer &&
        input.exporter == output.exporter &&
        input.issuingBank == output.issuingBank &&
        input.advisingBank == output.advisingBank
}
