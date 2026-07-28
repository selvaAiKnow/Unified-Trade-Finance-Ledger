package com.utfl.blockchainlayer.corda

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * Unit tests for RealCordaGateway.kt's bank-routing helper `resolveBank`.
 *
 * Generic over the map's value type so this can be tested with plain
 * Strings instead of real `CordaRPCOps` instances -- constructing a real
 * one requires a live Corda RPC connection, which this test deliberately
 * avoids (same reasoning as RunRpcTest.kt for `runRpc`).
 */
class ResolveBankTest {
    private val banks = mapOf(
        "IssuingBank" to "issuing-bank-connection",
        "AdvisingBank" to "advising-bank-connection",
        "Bank3" to "bank3-connection",
        "Bank4" to "bank4-connection"
    )

    @Test
    fun `an explicitly named bank resolves to its connection`() {
        assertEquals("bank3-connection", resolveBank(banks, "Bank3"))
    }

    @Test
    fun `a null bank name defaults to IssuingBank's connection`() {
        assertEquals("issuing-bank-connection", resolveBank(banks, null))
    }

    @Test
    fun `an unknown bank name throws IllegalArgumentException`() {
        val ex = assertFailsWith<IllegalArgumentException> {
            resolveBank(banks, "Bank99")
        }
        assertEquals("Unknown bank: Bank99", ex.message)
    }
}
