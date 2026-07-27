package com.utfl.blockchainlayer

import com.utfl.blockchainlayer.corda.CordaGateway
import com.utfl.blockchainlayer.corda.RealCordaGateway
import com.utfl.blockchainlayer.corda.RpcConfigLoader
import com.utfl.blockchainlayer.routes.flowRoutes
import com.utfl.blockchainlayer.routes.tradeRoutes
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json

fun main() {
    val connections = RpcConfigLoader.fromEnv()
    val gateway = RealCordaGateway(connections)
    embeddedServer(Netty, port = 8081, host = "0.0.0.0") { module(gateway) }
        .start(wait = true)
}

fun Application.module(gateway: CordaGateway) {
    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true })
    }
    routing {
        get("/health") {
            call.respondText("""{"status":"ok"}""", io.ktor.http.ContentType.Application.Json)
        }
        flowRoutes(gateway)
        tradeRoutes(gateway)
    }
}
