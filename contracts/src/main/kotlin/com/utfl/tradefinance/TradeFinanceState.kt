package com.utfl.tradefinance

import net.corda.core.contracts.BelongsToContract
import net.corda.core.contracts.LinearState
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.identity.AbstractParty
import net.corda.core.identity.Party
import net.corda.core.serialization.CordaSerializable

@CordaSerializable
@BelongsToContract(TradeFinanceContract::class)
data class TradeFinanceState(
    val lcReference: String,
    val importer: Party,
    val exporter: Party,
    val issuingBank: Party,
    val advisingBank: Party,
    val lcTermsHash: SecureHash,
    val status: TradeMilestoneStatus,
    val complianceOutcome: ComplianceOutcome? = null,
    val documentHashes: List<DocumentHashRecord> = emptyList(),
    override val linearId: UniqueIdentifier = UniqueIdentifier()
) : LinearState {
    override val participants: List<AbstractParty>
        get() = listOf(importer, exporter, issuingBank, advisingBank)
}
