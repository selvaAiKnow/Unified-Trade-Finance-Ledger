package com.utfl.blockchainlayer

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.fail

@Serializable
private data class FlowResultBody(val linearId: String, val txId: String, val status: String)

class FullLifecycleIT {
    private val baseUrl = System.getenv("BLOCKCHAIN_LAYER_URL") ?: "http://localhost:8081"
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json() }
    }

    @Test
    fun `one trade moves through all six milestones via the real REST API`() = runBlocking {
        // blockchain-layer connects to all 4 Corda nodes' RPC eagerly on startup and
        // does not open its HTTP port until that succeeds. Corda's RPC listeners take
        // ~35-48s to come up after the containers start, so blockchain-layer typically
        // crash-loops a few times (restart: on-failure in docker-compose.yml) before it
        // succeeds. On a cold `docker compose up`, the very first HTTP call this test
        // makes can easily land during one of those restart windows. Wait here until
        // /health actually answers before driving the real flow calls, so the test's
        // pass/fail reflects the system's actual health rather than container-start
        // timing. This makes the test self-contained (robust even if someone runs
        // `./gradlew integrationTest` directly, without the wrapper script's own wait).
        waitForServiceReady()

        val issueResponse: HttpResponse = client.post("$baseUrl/flows/issue-lc") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-IT-0001","lcTermsDocumentId":"DOC-1","lcTermsHash":"${sampleHash()}"}"""
            )
        }
        assertEquals(HttpStatusCode.Created, issueResponse.status)
        val issued: FlowResultBody = issueResponse.body()
        assertEquals("LC_ISSUED", issued.status)
        val linearId = issued.linearId

        val clearResponse = client.post("$baseUrl/flows/regulatory-clear") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","complianceOutcome":"CLEAR","documentId":"DOC-2","documentType":"WHO_GMP_CERTIFICATE","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("REGULATORY_CLEARED", clearResponse.body<FlowResultBody>().status)

        val shipResponse = client.post("$baseUrl/flows/ship-goods") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","documentId":"DOC-3","documentType":"BILL_OF_LADING","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("SHIPPED", shipResponse.body<FlowResultBody>().status)

        val acceptResponse = client.post("$baseUrl/flows/accept-docs") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"$linearId"}""")
        }
        assertEquals("ACCEPTED", acceptResponse.body<FlowResultBody>().status)

        val settleResponse = client.post("$baseUrl/flows/settle-payment") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","documentId":"DOC-5","documentType":"MT202","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("SETTLED", settleResponse.body<FlowResultBody>().status)

        val closeResponse = client.post("$baseUrl/flows/regulatory-close") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","documentId":"DOC-6","documentType":"EDPMS_CLOSURE_ENTRY","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("CLOSED", closeResponse.body<FlowResultBody>().status)

        val readResponse = client.get("$baseUrl/trades/$linearId")
        assertEquals(HttpStatusCode.OK, readResponse.status)
    }

    /**
     * Polls GET /health until it returns 200, or gives up after [timeoutMs].
     * Tolerates connection-refused (the port isn't open yet) and any non-200
     * response (e.g. during a restart) as "not ready yet" rather than failing
     * immediately -- those are exactly the symptoms of blockchain-layer still
     * being mid-restart-loop while its RPC connections to the 4 Corda nodes
     * come up.
     */
    private suspend fun waitForServiceReady(
        timeoutMs: Long = 120_000,
        pollIntervalMs: Long = 3_000
    ) {
        val deadline = System.currentTimeMillis() + timeoutMs
        var lastError: String? = null
        while (System.currentTimeMillis() < deadline) {
            try {
                val response = client.get("$baseUrl/health")
                if (response.status == HttpStatusCode.OK) {
                    return
                }
                lastError = "GET /health returned ${response.status}"
            } catch (e: Exception) {
                lastError = "GET /health failed: ${e::class.simpleName}: ${e.message}"
            }
            delay(pollIntervalMs)
        }
        fail("blockchain-layer at $baseUrl never became ready within ${timeoutMs}ms. Last error: $lastError")
    }

    private fun sampleHash(): String {
        // A syntactically valid SHA-256 hex string (Corda's SecureHash.parse requires 64 hex chars).
        return (1..64).joinToString("") { "A" }
    }
}
