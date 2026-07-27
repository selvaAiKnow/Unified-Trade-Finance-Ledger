package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.DocumentHashRecordDto
import com.utfl.blockchainlayer.corda.FakeCordaGateway
import com.utfl.blockchainlayer.corda.TradeStateDto
import com.utfl.blockchainlayer.module
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class TradeRoutesTest {
    private val sampleTrade = TradeStateDto(
        linearId = "abc-123",
        lcReference = "LC-2026-0001",
        importer = "Importer",
        exporter = "Exporter",
        issuingBank = "IssuingBank",
        advisingBank = "AdvisingBank",
        lcTermsHash = "ABCD",
        status = "LC_ISSUED",
        complianceOutcome = null,
        documentHashes = listOf(
            DocumentHashRecordDto(
                documentId = "DOC-1",
                category = "LC_TERMS",
                documentType = "LC_APPLICATION",
                onChainHash = "ABCD",
                milestone = "LC_ISSUED",
                anchoredAt = "2026-01-01T00:00:00Z"
            )
        )
    )

    @Test
    fun `GET trades linearId returns the trade when found`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.tradeToReturn = sampleTrade
        application { module(gateway) }

        val response = client.get("/trades/abc-123")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(
            """{"linearId":"abc-123","lcReference":"LC-2026-0001","importer":"Importer","exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcTermsHash":"ABCD","status":"LC_ISSUED","complianceOutcome":null,"documentHashes":[{"documentId":"DOC-1","category":"LC_TERMS","documentType":"LC_APPLICATION","onChainHash":"ABCD","milestone":"LC_ISSUED","anchoredAt":"2026-01-01T00:00:00Z"}]}""",
            response.bodyAsText()
        )
    }

    @Test
    fun `GET trades returns all trades`() = testApplication {
        val gateway = FakeCordaGateway()
        gateway.tradesToReturn = listOf(sampleTrade)
        application { module(gateway) }

        val response = client.get("/trades")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(
            """[{"linearId":"abc-123","lcReference":"LC-2026-0001","importer":"Importer","exporter":"Exporter","issuingBank":"IssuingBank","advisingBank":"AdvisingBank","lcTermsHash":"ABCD","status":"LC_ISSUED","complianceOutcome":null,"documentHashes":[{"documentId":"DOC-1","category":"LC_TERMS","documentType":"LC_APPLICATION","onChainHash":"ABCD","milestone":"LC_ISSUED","anchoredAt":"2026-01-01T00:00:00Z"}]}]""",
            response.bodyAsText()
        )
    }
}
