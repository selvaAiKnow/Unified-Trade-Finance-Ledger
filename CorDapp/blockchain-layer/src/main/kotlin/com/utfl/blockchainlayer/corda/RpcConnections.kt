package com.utfl.blockchainlayer.corda

import net.corda.client.rpc.CordaRPCClient
import net.corda.client.rpc.CordaRPCConnection
import net.corda.core.messaging.CordaRPCOps
import net.corda.core.utilities.NetworkHostAndPort

data class PartyRpcConfig(
    val host: String,
    val port: Int,
    val username: String,
    val password: String
)

class RpcConnections(
    importerConfig: PartyRpcConfig,
    exporterConfig: PartyRpcConfig,
    issuingBankConfig: PartyRpcConfig,
    advisingBankConfig: PartyRpcConfig
) : AutoCloseable {
    private val importerConnection = connect(importerConfig)
    private val exporterConnection = connect(exporterConfig)
    private val issuingBankConnection = connect(issuingBankConfig)
    private val advisingBankConnection = connect(advisingBankConfig)

    val importer: CordaRPCOps get() = importerConnection.proxy
    val exporter: CordaRPCOps get() = exporterConnection.proxy
    val issuingBank: CordaRPCOps get() = issuingBankConnection.proxy
    val advisingBank: CordaRPCOps get() = advisingBankConnection.proxy

    private fun connect(config: PartyRpcConfig): CordaRPCConnection {
        return try {
            CordaRPCClient(NetworkHostAndPort(config.host, config.port))
                .start(config.username, config.password)
        } catch (e: Exception) {
            throw CordaConnectionException("Could not connect to Corda RPC at ${config.host}:${config.port}", e)
        }
    }

    override fun close() {
        importerConnection.notifyServerAndClose()
        exporterConnection.notifyServerAndClose()
        issuingBankConnection.notifyServerAndClose()
        advisingBankConnection.notifyServerAndClose()
    }
}

object RpcConfigLoader {
    fun fromEnv(): RpcConnections {
        fun config(prefix: String, defaultPort: Int, defaultUser: String, defaultPassword: String) = PartyRpcConfig(
            host = System.getenv("${prefix}_RPC_HOST") ?: "localhost",
            port = (System.getenv("${prefix}_RPC_PORT") ?: defaultPort.toString()).toInt(),
            username = System.getenv("${prefix}_RPC_USER") ?: defaultUser,
            password = System.getenv("${prefix}_RPC_PASSWORD") ?: defaultPassword
        )

        return RpcConnections(
            importerConfig = config("IMPORTER", 10006, "importerRpc", "importerpass"),
            exporterConfig = config("EXPORTER", 10008, "exporterRpc", "exporterpass"),
            issuingBankConfig = config("ISSUING_BANK", 10010, "issuingBankRpc", "issuingbankpass"),
            advisingBankConfig = config("ADVISING_BANK", 10012, "advisingBankRpc", "advisingbankpass")
        )
    }
}
