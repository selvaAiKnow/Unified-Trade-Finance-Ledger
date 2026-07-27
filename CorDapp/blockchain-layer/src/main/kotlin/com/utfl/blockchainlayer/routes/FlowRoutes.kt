package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.CordaGateway
import com.utfl.blockchainlayer.corda.FlowResult
import com.utfl.blockchainlayer.dto.FlowResultResponse
import com.utfl.blockchainlayer.dto.IssueLCRequest
import com.utfl.blockchainlayer.dto.RegulatoryCloseRequest
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post

fun Route.flowRoutes(gateway: CordaGateway) {
    post("/flows/issue-lc") {
        val body = call.receive<IssueLCRequest>()
        val result = gateway.issueLC(
            exporter = body.exporter,
            issuingBank = body.issuingBank,
            advisingBank = body.advisingBank,
            lcReference = body.lcReference,
            lcTermsDocumentId = body.lcTermsDocumentId,
            lcTermsHash = body.lcTermsHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/regulatory-close") {
        val body = call.receive<RegulatoryCloseRequest>()
        val result = gateway.regulatoryClose(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }
}

fun FlowResult.toResponse() = FlowResultResponse(linearId = linearId, txId = txId, status = status)
