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
    bankConfigs: Map<String, PartyRpcConfig>
) : AutoCloseable {
    private val importerConnection = connect(importerConfig)
    private val exporterConnection = connect(exporterConfig)
    private val bankConnections: Map<String, CordaRPCConnection> =
        bankConfigs.mapValues { (_, config) -> connect(config) }

    val importer: CordaRPCOps get() = importerConnection.proxy
    val exporter: CordaRPCOps get() = exporterConnection.proxy
    val banks: Map<String, CordaRPCOps> get() = bankConnections.mapValues { (_, conn) -> conn.proxy }

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
        bankConnections.values.forEach { it.notifyServerAndClose() }
    }
}

private data class BankRpcDefaults(
    val envPrefix: String,
    val port: Int,
    val user: String,
    val password: String
)

private val knownBankDefaults: Map<String, BankRpcDefaults> = mapOf(
    "IssuingBank" to BankRpcDefaults("ISSUING_BANK", 10010, "issuingBankRpc", "issuingbankpass"),
    "AdvisingBank" to BankRpcDefaults("ADVISING_BANK", 10012, "advisingBankRpc", "advisingbankpass"),
    "Bank3" to BankRpcDefaults("BANK3", 10014, "bank3Rpc", "bank3pass"),
    "Bank4" to BankRpcDefaults("BANK4", 10016, "bank4Rpc", "bank4pass")
)

object RpcConfigLoader {
    fun fromEnv(): RpcConnections {
        fun config(prefix: String, defaultPort: Int, defaultUser: String, defaultPassword: String) = PartyRpcConfig(
            host = System.getenv("${prefix}_RPC_HOST") ?: "localhost",
            port = (System.getenv("${prefix}_RPC_PORT") ?: defaultPort.toString()).toInt(),
            username = System.getenv("${prefix}_RPC_USER") ?: defaultUser,
            password = System.getenv("${prefix}_RPC_PASSWORD") ?: defaultPassword
        )

        val bankNames = (System.getenv("BANK_NAMES") ?: knownBankDefaults.keys.joinToString(","))
            .split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }

        val bankConfigs = bankNames.associateWith { name ->
            val defaults = knownBankDefaults[name]
                ?: error("Unknown bank '$name' in BANK_NAMES -- no default RPC config registered for it in RpcConnections.kt")
            config(defaults.envPrefix, defaults.port, defaults.user, defaults.password)
        }

        return RpcConnections(
            importerConfig = config("IMPORTER", 10006, "importerRpc", "importerpass"),
            exporterConfig = config("EXPORTER", 10008, "exporterRpc", "exporterpass"),
            bankConfigs = bankConfigs
        )
    }
}
