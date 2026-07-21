package com.utfl.tradefinance

import net.corda.core.serialization.CordaSerializable

@CordaSerializable
enum class TradeMilestoneStatus {
    LC_ISSUED,
    REGULATORY_CLEARED,
    SHIPPED,
    ACCEPTED,
    SETTLED,
    CLOSED
}
