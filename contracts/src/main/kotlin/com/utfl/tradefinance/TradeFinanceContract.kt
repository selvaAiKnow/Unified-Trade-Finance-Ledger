package com.utfl.tradefinance

import net.corda.core.contracts.CommandData
import net.corda.core.contracts.Contract
import net.corda.core.contracts.requireSingleCommand
import net.corda.core.contracts.requireThat
import net.corda.core.transactions.LedgerTransaction
import java.security.PublicKey

class TradeFinanceContract : Contract {
    companion object {
        const val ID = "com.utfl.tradefinance.TradeFinanceContract"
    }

    interface Commands : CommandData {
        class IssueLC : Commands
    }

    override fun verify(tx: LedgerTransaction) {
        val command = tx.commands.requireSingleCommand<Commands>()
        val signers = command.signers.toSet()

        when (command.value) {
            is Commands.IssueLC -> verifyIssueLC(tx, signers)
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
}
