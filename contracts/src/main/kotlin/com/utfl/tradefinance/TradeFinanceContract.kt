package com.utfl.tradefinance

import net.corda.core.contracts.Contract
import net.corda.core.transactions.LedgerTransaction

class TradeFinanceContract : Contract {
    companion object {
        const val ID = "com.utfl.tradefinance.TradeFinanceContract"
    }

    override fun verify(tx: LedgerTransaction) {
        throw NotImplementedError("Implemented in Task 4")
    }
}
