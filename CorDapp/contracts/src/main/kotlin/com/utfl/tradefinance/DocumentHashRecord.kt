package com.utfl.tradefinance

import net.corda.core.crypto.SecureHash
import net.corda.core.serialization.CordaSerializable
import java.time.Instant

@CordaSerializable
data class DocumentHashRecord(
    val documentId: String,
    val category: String,
    val documentType: String,
    val onChainHash: SecureHash,
    val milestone: TradeMilestoneStatus,
    val anchoredAt: Instant
)
