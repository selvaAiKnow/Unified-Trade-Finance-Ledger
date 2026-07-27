package com.utfl.blockchainlayer.routes

import com.utfl.blockchainlayer.corda.CordaGateway
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

fun Route.tradeRoutes(gateway: CordaGateway) {
    get("/trades/{linearId}") {
        val linearId = call.parameters["linearId"]!!
        val trade = gateway.getTrade(linearId)
        call.respond(HttpStatusCode.OK, trade)
    }

    get("/trades") {
        call.respond(HttpStatusCode.OK, gateway.listTrades())
    }
}
