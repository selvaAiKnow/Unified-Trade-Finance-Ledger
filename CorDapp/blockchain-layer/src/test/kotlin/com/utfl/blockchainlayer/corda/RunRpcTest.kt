package com.utfl.blockchainlayer.corda

import net.corda.client.rpc.ConnectionFailureException
import net.corda.client.rpc.RPCException
import net.corda.core.flows.FlowException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame

/**
 * Unit tests for the RealCordaGateway.kt exception-mapping helper `runRpc`.
 *
 * These prove the STRUCTURE of the mapping (right exception type in -> right exception type
 * out) using the real Corda exception classes (`RPCException`, `ConnectionFailureException`,
 * `FlowException`) thrown directly by the test, not by a live RPC call. They cannot prove that
 * `RealCordaGateway`'s real calls into `CordaRPCOps` genuinely produce an `RPCException` when a
 * connection drops mid-session -- that was established by inspecting the corda-rpc-4.10.jar
 * bytecode with javap (RPCClientProxyHandler.invoke(...) throws RPCException /
 * ConnectionFailureException directly). Reproducing that end-to-end would require killing a
 * Corda node mid-flow-call in the Docker integration test.
 */
class RunRpcTest {
    @Test
    fun `FlowException is translated to FlowRejectedException`() {
        val ex = assertFailsWith<FlowRejectedException> {
            runRpc { throw FlowException("bad state") }
        }
        assertEquals("bad state", ex.message)
    }

    @Test
    fun `RPCException is translated to CordaConnectionException`() {
        val ex = assertFailsWith<CordaConnectionException> {
            runRpc { throw RPCException("RPC server is not available.") }
        }
        assertEquals("RPC server is not available.", ex.message)
    }

    @Test
    fun `ConnectionFailureException (an RPCException subtype) is translated to CordaConnectionException`() {
        // This is the concrete subtype RPCClientProxyHandler uses to fail outstanding
        // futures/observables when the underlying connection drops mid-call.
        val cause = RuntimeException("connection lost")
        val original = ConnectionFailureException(cause)
        val ex = assertFailsWith<CordaConnectionException> {
            runRpc { throw original }
        }
        assertSame(original, ex.cause)
    }

    @Test
    fun `unrelated exceptions are not swallowed into either mapping`() {
        assertFailsWith<IllegalArgumentException> {
            runRpc { throw IllegalArgumentException("bad hash") }
        }
        assertFailsWith<IllegalStateException> {
            runRpc { throw IllegalStateException("something else entirely") }
        }
    }

    @Test
    fun `a successful block returns its value untouched`() {
        assertEquals(42, runRpc { 42 })
    }
}
