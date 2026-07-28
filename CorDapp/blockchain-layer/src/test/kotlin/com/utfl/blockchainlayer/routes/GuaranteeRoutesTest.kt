package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.DocumentHashRecordDto
import com.utfl.blockchainlayer.corda.FakeCordaGateway
import com.utfl.blockchainlayer.corda.FakeGuaranteeGateway
import com.utfl.blockchainlayer.corda.FlowResult
import com.utfl.blockchainlayer.corda.GuaranteeStateDto
import com.utfl.blockchainlayer.module
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

class GuaranteeRoutesTest {
    @Test
    fun `POST flows issue-guarantee calls the gateway and returns the flow result`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.issueGuaranteeResult = FlowResult(linearId = "abc-123", txId = "tx-1", status = "ISSUED")
        application { module(cordaGateway, gateway) }

        val response = client.post("/flows/issue-guarantee") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"beneficiary":"Exporter","guarantorBank":"IssuingBank","advisingBank":"AdvisingBank","guaranteeReference":"BG-2026-0001","guaranteeTermsDocumentId":"DOC-1","guaranteeTermsHash":"ABCD"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-1","status":"ISSUED"}""",
            response.bodyAsText()
        )
        assertEquals(
            listOf("Exporter", "IssuingBank", "AdvisingBank", "BG-2026-0001", "DOC-1", "ABCD"),
            gateway.lastIssueGuaranteeArgs
        )
    }

    @Test
    fun `POST flows invoke-claim calls the gateway and returns the flow result`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.invokeClaimResult = FlowResult(linearId = "abc-123", txId = "tx-2", status = "CLAIM_INVOKED")
        application { module(cordaGateway, gateway) }

        val response = client.post("/flows/invoke-claim") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"abc-123","documentId":"DOC-2","documentType":"CLAIM_DEMAND","onChainHash":"1234"}""")
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-2","status":"CLAIM_INVOKED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-2", "CLAIM_DEMAND", "1234"), gateway.lastInvokeClaimArgs)
    }

    @Test
    fun `POST flows pay-claim forwards an explicit guarantorBank to the gateway`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.payClaimResult = FlowResult(linearId = "abc-123", txId = "tx-3", status = "CLAIM_PAID")
        application { module(cordaGateway, gateway) }

        val response = client.post("/flows/pay-claim") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"linearId":"abc-123","documentId":"DOC-3","documentType":"MT760","onChainHash":"5678","guarantorBank":"Bank3"}"""
            )
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-3","status":"CLAIM_PAID"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-3", "MT760", "5678", "Bank3"), gateway.lastPayClaimArgs)
    }

    @Test
    fun `POST flows pay-claim omits guarantorBank when the caller doesn't send it`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.payClaimResult = FlowResult(linearId = "abc-123", txId = "tx-3", status = "CLAIM_PAID")
        application { module(cordaGateway, gateway) }

        val response = client.post("/flows/pay-claim") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"abc-123","documentId":"DOC-3","documentType":"MT760","onChainHash":"5678"}""")
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(listOf("abc-123", "DOC-3", "MT760", "5678", null), gateway.lastPayClaimArgs)
    }

    @Test
    fun `POST flows close-guarantee calls the gateway and returns the flow result`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.closeGuaranteeResult = FlowResult(linearId = "abc-123", txId = "tx-4", status = "CLOSED")
        application { module(cordaGateway, gateway) }

        val response = client.post("/flows/close-guarantee") {
            contentType(ContentType.Application.Json)
            setBody("""{"linearId":"abc-123","documentId":"DOC-4","documentType":"GUARANTEE_CLOSURE_ENTRY","onChainHash":"9ABC"}""")
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(
            """{"linearId":"abc-123","txId":"tx-4","status":"CLOSED"}""",
            response.bodyAsText()
        )
        assertEquals(listOf("abc-123", "DOC-4", "GUARANTEE_CLOSURE_ENTRY", "9ABC"), gateway.lastCloseGuaranteeArgs)
    }

    private val sampleGuarantee = GuaranteeStateDto(
        linearId = "abc-123",
        guaranteeReference = "BG-2026-0001",
        applicant = "Importer",
        beneficiary = "Exporter",
        guarantorBank = "IssuingBank",
        advisingBank = "AdvisingBank",
        guaranteeTermsHash = "ABCD",
        status = "ISSUED",
        documentHashes = listOf(
            DocumentHashRecordDto(
                documentId = "DOC-1",
                category = "GUARANTEE_TERMS",
                documentType = "GUARANTEE_APPLICATION",
                onChainHash = "ABCD",
                milestone = "ISSUED",
                anchoredAt = "2026-01-01T00:00:00Z"
            )
        )
    )

    @Test
    fun `GET guarantees linearId returns the guarantee when found`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.guaranteeToReturn = sampleGuarantee
        application { module(cordaGateway, gateway) }

        val response = client.get("/guarantees/abc-123")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(
            """{"linearId":"abc-123","guaranteeReference":"BG-2026-0001","applicant":"Importer","beneficiary":"Exporter","guarantorBank":"IssuingBank","advisingBank":"AdvisingBank","guaranteeTermsHash":"ABCD","status":"ISSUED","documentHashes":[{"documentId":"DOC-1","category":"GUARANTEE_TERMS","documentType":"GUARANTEE_APPLICATION","onChainHash":"ABCD","milestone":"ISSUED","anchoredAt":"2026-01-01T00:00:00Z"}]}""",
            response.bodyAsText()
        )
    }

    @Test
    fun `GET guarantees returns all guarantees`() = testApplication {
        val cordaGateway = FakeCordaGateway()
        val gateway = FakeGuaranteeGateway()
        gateway.guaranteesToReturn = listOf(sampleGuarantee)
        application { module(cordaGateway, gateway) }

        val response = client.get("/guarantees")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(
            """[{"linearId":"abc-123","guaranteeReference":"BG-2026-0001","applicant":"Importer","beneficiary":"Exporter","guarantorBank":"IssuingBank","advisingBank":"AdvisingBank","guaranteeTermsHash":"ABCD","status":"ISSUED","documentHashes":[{"documentId":"DOC-1","category":"GUARANTEE_TERMS","documentType":"GUARANTEE_APPLICATION","onChainHash":"ABCD","milestone":"ISSUED","anchoredAt":"2026-01-01T00:00:00Z"}]}]""",
            response.bodyAsText()
        )
    }
}
