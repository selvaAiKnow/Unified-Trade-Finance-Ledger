package com.utfl.blockchainlayer.corda

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * Unit tests for RealCordaGateway.kt's `requireTradeOnBank`, the guard `acceptDocs` and
 * `settlePayment` run against the resolved bank's vault query result before starting a flow.
 *
 * Generic over the state type so this can be tested with a plain nullable String standing in
 * for a vault query's `StateAndRef<TradeFinanceState>?` result, instead of a real one --
 * producing a real vault query result requires a live Corda RPC connection (same reasoning as
 * RunRpcTest.kt / ResolveBankTest.kt / RequireKnownBankTest.kt). The full behavior this guards
 * -- RealCordaGateway.acceptDocs/settlePayment actually calling into a resolved bank's
 * CordaRPCOps and finding no vault state -- is exercised end-to-end by the Docker integration
 * suite (FullLifecycleIT / a routing-mismatch scenario there), not by these fast unit tests.
 */
class RequireTradeOnBankTest {
    @Test
    fun `a found state is returned unchanged`() {
        val state = "some-state-and-ref"
        assertEquals(state, requireTradeOnBank(state, "abc-123", "Bank3"))
    }

    @Test
    fun `a null state (node was never a participant) throws FlowRejectedException`() {
        val ex = assertFailsWith<FlowRejectedException> {
            requireTradeOnBank<String>(null, "abc-123", "Bank3")
        }
        assertEquals("Trade abc-123 was not issued by Bank3", ex.message)
    }
}
