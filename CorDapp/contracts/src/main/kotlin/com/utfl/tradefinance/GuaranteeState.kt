package com.utfl.tradefinance

import net.corda.core.contracts.BelongsToContract
import net.corda.core.contracts.LinearState
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.identity.AbstractParty
import net.corda.core.identity.Party
import net.corda.core.serialization.CordaSerializable

@CordaSerializable
@BelongsToContract(GuaranteeContract::class)
data class GuaranteeState(
    val guaranteeReference: String,
    val applicant: Party,
    val beneficiary: Party,
    val guarantorBank: Party,
    val advisingBank: Party,
    val guaranteeTermsHash: SecureHash,
    val status: GuaranteeMilestoneStatus,
    val documentHashes: List<GuaranteeDocumentHashRecord> = emptyList(),
    override val linearId: UniqueIdentifier = UniqueIdentifier()
) : LinearState {
    override val participants: List<AbstractParty>
        get() = listOf(applicant, beneficiary, guarantorBank, advisingBank)
}
