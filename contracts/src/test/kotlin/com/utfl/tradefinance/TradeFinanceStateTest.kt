package com.utfl.tradefinance

import net.corda.core.crypto.SecureHash
import net.corda.core.identity.CordaX500Name
import net.corda.testing.core.TestIdentity
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TradeFinanceStateTest {
    private val importer = TestIdentity(CordaX500Name("Importer", "Mumbai", "IN")).party
    private val exporter = TestIdentity(CordaX500Name("Exporter", "Mumbai", "IN")).party
    private val issuingBank = TestIdentity(CordaX500Name("IssuingBank", "Tokyo", "JP")).party
    private val advisingBank = TestIdentity(CordaX500Name("AdvisingBank", "Mumbai", "IN")).party

    private fun newState() = TradeFinanceState(
        lcReference = "LC-2026-0001",
        importer = importer,
        exporter = exporter,
        issuingBank = issuingBank,
        advisingBank = advisingBank,
        lcTermsHash = SecureHash.randomSHA256(),
        status = TradeMilestoneStatus.LC_ISSUED
    )

    @Test
    fun `participants includes all four parties`() {
        val state = newState()
        assertEquals(4, state.participants.size)
        assertTrue(state.participants.containsAll(listOf(importer, exporter, issuingBank, advisingBank)))
    }

    @Test
    fun `document hashes default to empty and compliance outcome defaults to null`() {
        val state = newState()
        assertTrue(state.documentHashes.isEmpty())
        assertNull(state.complianceOutcome)
    }
}
