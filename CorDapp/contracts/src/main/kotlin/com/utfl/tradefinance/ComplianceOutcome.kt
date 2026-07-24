package com.utfl.tradefinance

import net.corda.core.serialization.CordaSerializable

@CordaSerializable
enum class ComplianceOutcome {
    CLEAR,
    REVIEW,
    BLOCK
}
