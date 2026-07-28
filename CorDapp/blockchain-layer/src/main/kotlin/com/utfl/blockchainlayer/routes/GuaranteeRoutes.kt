package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.GuaranteeGateway
import com.utfl.blockchainlayer.dto.CloseGuaranteeRequest
import com.utfl.blockchainlayer.dto.InvokeClaimRequest
import com.utfl.blockchainlayer.dto.IssueGuaranteeRequest
import com.utfl.blockchainlayer.dto.PayClaimRequest
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post

fun Route.guaranteeRoutes(gateway: GuaranteeGateway) {
    post("/flows/issue-guarantee") {
        val body = call.receive<IssueGuaranteeRequest>()
        val result = gateway.issueGuarantee(
            beneficiary = body.beneficiary,
            guarantorBank = body.guarantorBank,
            advisingBank = body.advisingBank,
            guaranteeReference = body.guaranteeReference,
            guaranteeTermsDocumentId = body.guaranteeTermsDocumentId,
            guaranteeTermsHash = body.guaranteeTermsHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/invoke-claim") {
        val body = call.receive<InvokeClaimRequest>()
        val result = gateway.invokeClaim(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/pay-claim") {
        val body = call.receive<PayClaimRequest>()
        val result = gateway.payClaim(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash,
            guarantorBank = body.guarantorBank
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    post("/flows/close-guarantee") {
        val body = call.receive<CloseGuaranteeRequest>()
        val result = gateway.closeGuarantee(
            linearId = body.linearId,
            documentId = body.documentId,
            documentType = body.documentType,
            onChainHash = body.onChainHash
        )
        call.respond(HttpStatusCode.Created, result.toResponse())
    }

    get("/guarantees/{linearId}") {
        val linearId = call.parameters["linearId"]!!
        val guarantee = gateway.getGuarantee(linearId)
        call.respond(HttpStatusCode.OK, guarantee)
    }

    get("/guarantees") {
        call.respond(HttpStatusCode.OK, gateway.listGuarantees())
    }
}
