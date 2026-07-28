package com.utfl.blockchainlayer

import com.utfl.blockchainlayer.corda.CordaConnectionException
import com.utfl.blockchainlayer.corda.CordaGateway
import com.utfl.blockchainlayer.corda.FlowRejectedException
import com.utfl.blockchainlayer.corda.GuaranteeGateway
import com.utfl.blockchainlayer.corda.GuaranteeNotFoundException
import com.utfl.blockchainlayer.corda.RealCordaGateway
import com.utfl.blockchainlayer.corda.RealGuaranteeGateway
import com.utfl.blockchainlayer.corda.RpcConfigLoader
import com.utfl.blockchainlayer.corda.TradeNotFoundException
import com.utfl.blockchainlayer.dto.ErrorResponse
import com.utfl.blockchainlayer.routes.flowRoutes
import com.utfl.blockchainlayer.routes.guaranteeRoutes
import com.utfl.blockchainlayer.routes.tradeRoutes
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.application.log
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json

fun main() {
    val connections = RpcConfigLoader.fromEnv()
    val gateway = RealCordaGateway(connections)
    val guaranteeGateway = RealGuaranteeGateway(connections)
    embeddedServer(Netty, port = 8081, host = "0.0.0.0") { module(gateway, guaranteeGateway) }
        .start(wait = true)
}

// guaranteeGateway is nullable only for backward compatibility with tests that predate the
// Bank Guarantee instrument and don't exercise any guarantee endpoint; main() below always
// supplies a real RealGuaranteeGateway. Don't treat null as an intentional "disable guarantees"
// feature flag -- it isn't wired to any config and never will be in production.
fun Application.module(gateway: CordaGateway, guaranteeGateway: GuaranteeGateway? = null) {
    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true })
    }
    install(StatusPages) {
        exception<TradeNotFoundException> { call, cause ->
            call.respond(HttpStatusCode.NotFound, ErrorResponse(cause.message ?: "Not found"))
        }
        exception<GuaranteeNotFoundException> { call, cause ->
            call.respond(HttpStatusCode.NotFound, ErrorResponse(cause.message ?: "Not found"))
        }
        exception<FlowRejectedException> { call, cause ->
            call.respond(HttpStatusCode.BadRequest, ErrorResponse(cause.message ?: "Flow rejected"))
        }
        exception<CordaConnectionException> { call, cause ->
            call.respond(HttpStatusCode.BadGateway, ErrorResponse(cause.message ?: "Corda connection failed"))
        }
        exception<IllegalArgumentException> { call, cause ->
            call.respond(HttpStatusCode.BadRequest, ErrorResponse(cause.message ?: "Invalid input"))
        }
        exception<Throwable> { call, cause ->
            call.application.log.error("Unhandled exception while processing ${call.request.local.uri}", cause)
            call.respond(HttpStatusCode.InternalServerError, ErrorResponse("Internal server error"))
        }
    }
    routing {
        get("/health") {
            call.respondText("""{"status":"ok"}""", io.ktor.http.ContentType.Application.Json)
        }
        flowRoutes(gateway)
        tradeRoutes(gateway)
        guaranteeGateway?.let { guaranteeRoutes(it) }
    }
}
