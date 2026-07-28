package com.utfl.tradefinance

import net.corda.core.serialization.CordaSerializable

@CordaSerializable
enum class GuaranteeMilestoneStatus {
    ISSUED,
    CLAIM_INVOKED,
    CLAIM_PAID,
    CLOSED
}
