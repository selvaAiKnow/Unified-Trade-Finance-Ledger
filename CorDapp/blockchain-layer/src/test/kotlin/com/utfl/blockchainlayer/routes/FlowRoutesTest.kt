package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.FakeCordaGateway
import com.utfl.blockchainlayer.corda.FlowResult
import com.utfl.blockchainlayer.module
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class FlowRoutesTest {
    @Test
    fun `POST flows issue-lc calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.issueLCResult = FlowResult(linearId = "abc-123", txId = "tx-1", status = "LC_ISSUED")
        application { module(gateway) }

        val response = client.post("/flows/issue-lc") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcReference":"LC-2026-0001","lcTermsDocumentId":"DOC-1","lcTermsHash":"ABCD"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-1","status":"LC_ISSUED"}""",
            response.bodyAsText()
        )
        assertEquals(
            listOf("Exporter", "IssuingBank", "AdvisingBank", "LC-2026-0001", "DOC-1", "ABCD"),
            gateway.lastIssueLCArgs
        )
    }

    @Test
    fun `POST flows regulatory-close calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.regulatoryCloseResult = FlowResult(linearId = "abc-123", txId = "tx-6", status = "CLOSED")
        application { module(gateway) }

        val response = client.post("/flows/regulatory-close") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","documentId":"DOC-6","documentType":"EDPMS_CLOSURE_ENTRY","onChainHash":"EF01"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-6","status":"CLOSED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-6", "EDPMS_CLOSURE_ENTRY", "EF01"), gateway.lastRegulatoryCloseArgs)
    }
}
