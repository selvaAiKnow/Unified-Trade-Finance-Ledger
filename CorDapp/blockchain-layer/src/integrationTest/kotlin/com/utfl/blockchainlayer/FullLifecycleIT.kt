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
private data class FlowResultBody(val linearId: String, val txId: String, val status: String)

@Serializable
private data class TradeStateBody(val issuingBank: String, val advisingBank: String)

class FullLifecycleIT {
    private val baseUrl = System.getenv("BLOCKCHAIN_LAYER_URL") ?: "http://localhost:8081"
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

    @Test
    fun `one trade moves through all six milestones via the real REST API`() = runBlocking {
        client.waitForServiceReady(baseUrl)
        runFullLifecycle(
            lcReference = "LC-IT-0001",
            issuingBank = "IssuingBank",
            advisingBank = "AdvisingBank",
            issuingBankOverrideForLaterCalls = null
        )
        // runFullLifecycle returns the created linearId (String), which this test
        // doesn't need. Without this trailing Unit, the expression body's inferred
        // return type becomes String instead of Unit -- JUnit Jupiter then silently
        // fails to recognize this method as a valid @Test (methods must return
        // void/Unit) and drops it from discovery with no build failure, no test
        // failure, and no console warning. Confirmed by direct reproduction: without
        // this line, `./gradlew integrationTest` reports "BUILD SUCCESSFUL" with only
        // 1 test executed (the other @Test method in this class), not 2.
        Unit
    }

    @Test
    fun `two independent trades against different bank pairs both reach SETTLED concurrently`() = runBlocking {
        client.waitForServiceReady(baseUrl)

        val linearIds = awaitAll(
            async {
                runFullLifecycle(
                    lcReference = "LC-IT-BankPairA",
                    issuingBank = "IssuingBank",
                    advisingBank = "AdvisingBank",
                    issuingBankOverrideForLaterCalls = null
                )
            },
            async {
                runFullLifecycle(
                    lcReference = "LC-IT-BankPairB",
                    issuingBank = "Bank3",
                    advisingBank = "Bank4",
                    issuingBankOverrideForLaterCalls = "Bank3"
                )
            }
        )

        assertEquals(2, linearIds.distinct().size)
    }

    /**
     * Drives one trade through all six milestones plus a final read-back,
     * asserting the read-back's issuingBank/advisingBank match what was
     * requested -- proving the RPC connection actually used to advance the
     * trade was the one belonging to the named bank, not a stale default.
     *
     * [issuingBankOverrideForLaterCalls] controls what (if anything) is sent
     * in accept-docs/settle-payment's new `issuingBank` field: null omits it
     * entirely (proving the default-to-IssuingBank backward-compatibility
     * path used by ledger-monitoring's existing, unmodified calls), a
     * non-null value sends it explicitly (proving the routing fix is
     * necessary and correct for a non-default bank pair).
     */
    private suspend fun runFullLifecycle(
        lcReference: String,
        issuingBank: String,
        advisingBank: String,
        issuingBankOverrideForLaterCalls: String?
    ): String {
        val issueResponse: HttpResponse = client.post("$baseUrl/flows/issue-lc") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"exporter":"Exporter","issuingBank":"$issuingBank","advisingBank":"$advisingBank","lcReference":"$lcReference","lcTermsDocumentId":"DOC-1","lcTermsHash":"${sampleHash()}"}"""
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

        val acceptBody = if (issuingBankOverrideForLaterCalls != null) {
            """{"linearId":"$linearId","issuingBank":"$issuingBankOverrideForLaterCalls"}"""
        } else {
            """{"linearId":"$linearId"}"""
        }
        val acceptResponse = client.post("$baseUrl/flows/accept-docs") {
            contentType(ContentType.Application.Json)
            setBody(acceptBody)
        }
        assertEquals("ACCEPTED", acceptResponse.body<FlowResultBody>().status)

        val settleBody = if (issuingBankOverrideForLaterCalls != null) {
            """{"linearId":"$linearId","documentId":"DOC-5","documentType":"MT202","onChainHash":"${sampleHash()}","issuingBank":"$issuingBankOverrideForLaterCalls"}"""
        } else {
            """{"linearId":"$linearId","documentId":"DOC-5","documentType":"MT202","onChainHash":"${sampleHash()}"}"""
        }
        val settleResponse = client.post("$baseUrl/flows/settle-payment") {
            contentType(ContentType.Application.Json)
            setBody(settleBody)
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
        val trade: TradeStateBody = readResponse.body()
        assertEquals(issuingBank, trade.issuingBank)
        assertEquals(advisingBank, trade.advisingBank)

        return linearId
    }
}
