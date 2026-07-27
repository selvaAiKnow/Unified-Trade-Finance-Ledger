package com.utfl.blockchainlayer

import com.utfl.blockchainlayer.corda.CordaConnectionException
import com.utfl.blockchainlayer.corda.FakeCordaGateway
import com.utfl.blockchainlayer.corda.FlowRejectedException
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class ErrorHandlingTest {
    @Test
    fun `unknown linearId returns 404 with an error body`() = testApplication {
        val gateway = FakeCordaGateway()
        application { module(gateway) }

        val response = client.get("/trades/does-not-exist")

        assertEquals(HttpStatusCode.NotFound, response.status)
        assertEquals("""{"error":"No trade found with linearId=does-not-exist"}""", response.bodyAsText())
    }

    @Test
    fun `a rejected flow returns 400 with an error body`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.issueLCError = FlowRejectedException("Contract verification failed: bad input")
        application { module(gateway) }

        val response = client.post("/flows/issue-lc") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-1","lcTermsDocumentId":"DOC-1","lcTermsHash":"ABCD"}"""
            )
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals("""{"error":"Contract verification failed: bad input"}""", response.bodyAsText())
    }

    @Test
    fun `an RPC connection failure returns 502 with an error body`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.issueLCError = CordaConnectionException("Could not connect to Corda RPC at localhost:10006")
        application { module(gateway) }

        val response = client.post("/flows/issue-lc") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-1","lcTermsDocumentId":"DOC-1","lcTermsHash":"ABCD"}"""
            )
        }

        assertEquals(HttpStatusCode.BadGateway, response.status)
        assertEquals("""{"error":"Could not connect to Corda RPC at localhost:10006"}""", response.bodyAsText())
    }
}
