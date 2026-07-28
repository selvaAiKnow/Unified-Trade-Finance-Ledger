package com.utfl.blockchainlayer.corda

import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertEquals

/**
 * Unit tests for RealCordaGateway.kt's `requireKnownBank`, the guard `issueLC` runs against
 * `issuingBank` before starting the flow.
 *
 * Generic over the map's value type so this can be tested with plain Strings instead of real
 * `CordaRPCOps` instances -- constructing a real one requires a live Corda RPC connection,
 * which this test deliberately avoids (same reasoning as RunRpcTest.kt / ResolveBankTest.kt).
 *
 * This specifically covers the "bank exists on the Corda network map but has no RPC
 * connection" misconfiguration case: a bank present in `connections.banks` is fine (no
 * exception), one absent from it fails fast with a 400-mapped IllegalArgumentException instead
 * of letting issue-lc strand a trade whose issuing bank can never be reached again via
 * accept-docs/settle-payment.
 */
class RequireKnownBankTest {
    private val banks = mapOf(
        "IssuingBank" to "issuing-bank-connection",
        "AdvisingBank" to "advising-bank-connection",
        "Bank3" to "bank3-connection",
        "Bank4" to "bank4-connection"
    )

    @Test
    fun `a bank present in the RPC pool passes without throwing`() {
        requireKnownBank(banks, "Bank3")
    }

    @Test
    fun `a bank absent from the RPC pool throws IllegalArgumentException`() {
        val ex = assertFailsWith<IllegalArgumentException> {
            requireKnownBank(banks, "Bank5")
        }
        assertEquals("Unknown bank: Bank5", ex.message)
    }
}
