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
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

@Serializable
private data class GuaranteeFlowResultBody(val linearId: String, val txId: String, val status: String)

@Serializable
private data class GuaranteeStateBody(val guarantorBank: String, val advisingBank: String)

class GuaranteeLifecycleIT {
    private val baseUrl = System.getenv("BLOCKCHAIN_LAYER_URL") ?: "http://localhost:8081"
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

    @Test
    fun `one guarantee moves through all four milestones via the real REST API`() = runBlocking {
        client.waitForServiceReady(baseUrl)
        runFullLifecycle(
            guaranteeReference = "BG-IT-0001",
            guarantorBank = "IssuingBank",
            advisingBank = "AdvisingBank",
            guarantorBankOverrideForPayClaim = null
        )
        // Explicit trailing Unit: runFullLifecycle returns String (the linearId), and an
        // expression-bodied @Test whose inferred return type isn't Unit gets silently dropped
        // from JUnit discovery with no build failure -- see this plan's Global Constraints.
        Unit
    }

    @Test
    fun `two independent guarantees against different guarantor banks both reach CLOSED concurrently`() = runBlocking {
        client.waitForServiceReady(baseUrl)

        val linearIds = awaitAll(
            async {
                runFullLifecycle(
                    guaranteeReference = "BG-IT-PairA",
                    guarantorBank = "IssuingBank",
                    advisingBank = "AdvisingBank",
                    guarantorBankOverrideForPayClaim = null
                )
            },
            async {
                runFullLifecycle(
                    guaranteeReference = "BG-IT-PairB",
                    guarantorBank = "Bank3",
                    advisingBank = "Bank4",
                    guarantorBankOverrideForPayClaim = "Bank3"
                )
            }
        )

        assertEquals(2, linearIds.distinct().size)
    }

    /**
     * Drives one guarantee through all four milestones plus a final read-back, asserting the
     * read-back's guarantorBank/advisingBank match what was requested -- proving the RPC
     * connection actually used to advance the guarantee was the one belonging to the named
     * bank, not a stale default. [guarantorBankOverrideForPayClaim] mirrors
     * FullLifecycleIT.runFullLifecycle's own issuingBankOverrideForLaterCalls: null omits the
     * field from pay-claim entirely (proving the default-to-IssuingBank path), a non-null value
     * sends it explicitly (proving routing to a non-default bank).
     */
    private suspend fun runFullLifecycle(
        guaranteeReference: String,
        guarantorBank: String,
        advisingBank: String,
        guarantorBankOverrideForPayClaim: String?
    ): String {
        val issueResponse: HttpResponse = client.post("$baseUrl/flows/issue-guarantee") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"beneficiary":"Exporter","guarantorBank":"$guarantorBank","advisingBank":"$advisingBank","guaranteeReference":"$guaranteeReference","guaranteeTermsDocumentId":"DOC-1","guaranteeTermsHash":"${sampleHash()}"}"""
            )
        }
        assertEquals(HttpStatusCode.Created, issueResponse.status)
        val issued: GuaranteeFlowResultBody = issueResponse.body()
        assertEquals("ISSUED", issued.status)
        val linearId = issued.linearId

        val invokeResponse = client.post("$baseUrl/flows/invoke-claim") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","documentId":"DOC-2","documentType":"CLAIM_DEMAND","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("CLAIM_INVOKED", invokeResponse.body<GuaranteeFlowResultBody>().status)

        val payBody = if (guarantorBankOverrideForPayClaim != null) {
            """{"linearId":"$linearId","documentId":"DOC-3","documentType":"MT760","onChainHash":"${sampleHash()}","guarantorBank":"$guarantorBankOverrideForPayClaim"}"""
        } else {
            """{"linearId":"$linearId","documentId":"DOC-3","documentType":"MT760","onChainHash":"${sampleHash()}"}"""
        }
        val payResponse = client.post("$baseUrl/flows/pay-claim") {
            contentType(ContentType.Application.Json)
            setBody(payBody)
        }
        assertEquals("CLAIM_PAID", payResponse.body<GuaranteeFlowResultBody>().status)

        val closeResponse = client.post("$baseUrl/flows/close-guarantee") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"$linearId","documentId":"DOC-4","documentType":"GUARANTEE_CLOSURE_ENTRY","onChainHash":"${sampleHash()}"}"""
            )
        }
        assertEquals("CLOSED", closeResponse.body<GuaranteeFlowResultBody>().status)

        val readResponse = client.get("$baseUrl/guarantees/$linearId")
        assertEquals(HttpStatusCode.OK, readResponse.status)
        val guarantee: GuaranteeStateBody = readResponse.body()
        assertEquals(guarantorBank, guarantee.guarantorBank)
        assertEquals(advisingBank, guarantee.advisingBank)

        return linearId
    }
}
