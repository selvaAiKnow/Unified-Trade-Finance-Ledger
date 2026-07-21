package com.utfl.tradefinance

import net.corda.core.crypto.SecureHash
import org.junit.Test
import java.time.Instant
import kotlin.test.assertEquals

class TradeFinanceTypesTest {
    @Test
    fun `TradeMilestoneStatus has the six expected milestones in order`() {
        assertEquals(
            listOf(
                TradeMilestoneStatus.LC_ISSUED,
                TradeMilestoneStatus.REGULATORY_CLEARED,
                TradeMilestoneStatus.SHIPPED,
                TradeMilestoneStatus.ACCEPTED,
                TradeMilestoneStatus.SETTLED,
                TradeMilestoneStatus.CLOSED
            ),
            TradeMilestoneStatus.values().toList()
        )
    }

    @Test
    fun `ComplianceOutcome has CLEAR REVIEW and BLOCK`() {
        assertEquals(
            listOf(ComplianceOutcome.CLEAR, ComplianceOutcome.REVIEW, ComplianceOutcome.BLOCK),
            ComplianceOutcome.values().toList()
        )
    }

    @Test
    fun `DocumentHashRecord holds only the anchored fields`() {
        val hash = SecureHash.randomSHA256()
        val now = Instant.now()
        val record = DocumentHashRecord(
            documentId = "DOC-1",
            category = "LC_TERMS",
            documentType = "LC_APPLICATION",
            onChainHash = hash,
            milestone = TradeMilestoneStatus.LC_ISSUED,
            anchoredAt = now
        )
        assertEquals("DOC-1", record.documentId)
        assertEquals(hash, record.onChainHash)
        assertEquals(TradeMilestoneStatus.LC_ISSUED, record.milestone)
        assertEquals(now, record.anchoredAt)
    }
}
