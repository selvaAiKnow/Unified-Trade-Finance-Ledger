package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.FakeCordaGateway
import com.utfl.blockchainlayer.corda.FlowResult
import com.utfl.blockchainlayer.dto.RegulatoryClearRequest
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

    @Test
    fun `POST flows regulatory-clear calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.regulatoryClearResult = FlowResult(linearId = "abc-123", txId = "tx-2", status = "REGULATORY_CLEARED")
        application { module(gateway) }

        val response = client.post("/flows/regulatory-clear") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","complianceOutcome":"CLEAR","documentId":"DOC-2","documentType":"WHO_GMP_CERTIFICATE","onChainHash":"1234"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-2","status":"REGULATORY_CLEARED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "CLEAR", "DOC-2", "WHO_GMP_CERTIFICATE", "1234"), gateway.lastRegulatoryClearArgs)
    }

    @Test
    fun `POST flows ship-goods calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.shipGoodsResult = FlowResult(linearId = "abc-123", txId = "tx-3", status = "SHIPPED")
        application { module(gateway) }

        val response = client.post("/flows/ship-goods") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","documentId":"DOC-3","documentType":"BILL_OF_LADING","onChainHash":"5678"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-3","status":"SHIPPED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-3", "BILL_OF_LADING", "5678"), gateway.lastShipGoodsArgs)
    }

    @Test
    fun `POST flows accept-docs calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.acceptDocsResult = FlowResult(linearId = "abc-123", txId = "tx-4", status = "ACCEPTED")
        application { module(gateway) }

        val response = client.post("/flows/accept-docs") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"abc-123"}""")
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-4","status":"ACCEPTED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123"), gateway.lastAcceptDocsArgs)
    }

    @Test
    fun `POST flows settle-payment calls the gateway and returns the flow result`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.settlePaymentResult = FlowResult(linearId = "abc-123", txId = "tx-5", status = "SETTLED")
        application { module(gateway) }

        val response = client.post("/flows/settle-payment") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","documentId":"DOC-5","documentType":"MT202","onChainHash":"9ABC"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-5","status":"SETTLED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-5", "MT202", "9ABC"), gateway.lastSettlePaymentArgs)
    }
}
