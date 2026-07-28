package com.utfl.blockchainlayer.corda

import com.utfl.tradefinance.ComplianceOutcome
import com.utfl.tradefinance.DocumentHashRecord
import com.utfl.tradefinance.TradeFinanceState
import com.utfl.tradefinance.flows.AcceptDocsFlow
import com.utfl.tradefinance.flows.IssueLCFlow
import com.utfl.tradefinance.flows.RegulatoryClearFlow
import com.utfl.tradefinance.flows.RegulatoryCloseFlow
import com.utfl.tradefinance.flows.SettlePaymentFlow
import com.utfl.tradefinance.flows.ShipGoodsFlow
import net.corda.client.rpc.RPCException
import net.corda.core.contracts.StateAndRef
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.flows.FlowException
import net.corda.core.identity.Party
import net.corda.core.messaging.CordaRPCOps
import net.corda.core.messaging.vaultQueryBy
import net.corda.core.node.services.Vault
import net.corda.core.node.services.vault.QueryCriteria
import net.corda.core.transactions.SignedTransaction
import net.corda.core.utilities.getOrThrow

class RealCordaGateway(private val connections: RpcConnections) : CordaGateway {

    override fun issueLC(
        exporter: String,
        issuingBank: String,
        advisingBank: String,
        lcReference: String,
        lcTermsDocumentId: String,
        lcTermsHash: String
    ): FlowResult {
        val ops = connections.importer
        val exporterParty = resolveParty(ops, exporter)
        val issuingBankParty = resolveParty(ops, issuingBank)
        val advisingBankParty = resolveParty(ops, advisingBank)
        // issuingBank must resolve to a bank blockchain-layer actually has an RPC connection
        // for (connections.banks), not merely a party that exists on the Corda network map
        // (resolveParty above checks the latter, which includes every party -- Importer,
        // Exporter, Notary, and banks not yet wired up via BANK_NAMES). Without this, issue-lc
        // would happily create a trade whose issuing bank has no RPC connection, and every
        // subsequent accept-docs/settle-payment for it would permanently fail with
        // "Unknown bank: <name>" -- stranding the trade on-chain with no recovery path.
        // advisingBank does NOT need this check: it's only ever resolved as a Party for
        // signing (via resolveParty above) and never needs its own RPC connection.
        requireKnownBank(connections.banks, issuingBank)

        val stx = runRpc {
            ops.startFlowDynamic(
                IssueLCFlow.Initiator::class.java,
                issuingBankParty,
                exporterParty,
                advisingBankParty,
                lcReference,
                lcTermsDocumentId,
                SecureHash.parse(lcTermsHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun regulatoryClear(
        linearId: String,
        complianceOutcome: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult {
        val ops = connections.exporter
        val stx = runRpc {
            ops.startFlowDynamic(
                RegulatoryClearFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                ComplianceOutcome.valueOf(complianceOutcome),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun shipGoods(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.exporter
        val stx = runRpc {
            ops.startFlowDynamic(
                ShipGoodsFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun acceptDocs(linearId: String, issuingBank: String?): FlowResult {
        val bankName = issuingBank ?: DEFAULT_ISSUING_BANK
        val ops = resolveBank(connections.banks, issuingBank)
        // UniqueIdentifier.fromString stays outside runRpc/requireTradeOnBank so a malformed
        // linearId still surfaces as its own 400 via the IllegalArgumentException handler,
        // rather than being folded into the "not issued by" message below.
        val id = UniqueIdentifier.fromString(linearId)
        requireTradeOnBank(runRpc { queryOne(ops, id) }, linearId, bankName)
        val stx = runRpc {
            ops.startFlowDynamic(
                AcceptDocsFlow.Initiator::class.java,
                id
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun settlePayment(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String,
        issuingBank: String?
    ): FlowResult {
        val bankName = issuingBank ?: DEFAULT_ISSUING_BANK
        val ops = resolveBank(connections.banks, issuingBank)
        // See acceptDocs above: UniqueIdentifier.fromString stays outside runRpc/
        // requireTradeOnBank so a malformed linearId still surfaces as its own 400.
        val id = UniqueIdentifier.fromString(linearId)
        requireTradeOnBank(runRpc { queryOne(ops, id) }, linearId, bankName)
        val stx = runRpc {
            ops.startFlowDynamic(
                SettlePaymentFlow.Initiator::class.java,
                id,
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun regulatoryClose(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.importer
        val stx = runRpc {
            ops.startFlowDynamic(
                RegulatoryCloseFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun getTrade(linearId: String): TradeStateDto {
        val id = UniqueIdentifier.fromString(linearId)
        val stateAndRef = runRpc { queryOne(connections.importer, id) }
            ?: throw TradeNotFoundException(linearId)
        return toDto(stateAndRef)
    }

    override fun listTrades(): List<TradeStateDto> {
        val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
        return runRpc { connections.importer.vaultQueryBy<TradeFinanceState>(criteria).states.map { toDto(it) } }
    }

    private fun queryOne(ops: CordaRPCOps, linearId: UniqueIdentifier): StateAndRef<TradeFinanceState>? {
        val criteria = QueryCriteria.LinearStateQueryCriteria(
            linearId = listOf(linearId),
            status = Vault.StateStatus.UNCONSUMED
        )
        return ops.vaultQueryBy<TradeFinanceState>(criteria).states.singleOrNull()
    }

    private fun toFlowResult(stx: SignedTransaction): FlowResult {
        val state = stx.tx.outputsOfType<TradeFinanceState>().single()
        return FlowResult(
            linearId = state.linearId.id.toString(),
            txId = stx.id.toString(),
            status = state.status.name
        )
    }

    private fun toDto(stateAndRef: StateAndRef<TradeFinanceState>): TradeStateDto {
        val state = stateAndRef.state.data
        return TradeStateDto(
            linearId = state.linearId.id.toString(),
            lcReference = state.lcReference,
            importer = state.importer.name.organisation,
            exporter = state.exporter.name.organisation,
            issuingBank = state.issuingBank.name.organisation,
            advisingBank = state.advisingBank.name.organisation,
            lcTermsHash = state.lcTermsHash.toString(),
            status = state.status.name,
            complianceOutcome = state.complianceOutcome?.name,
            documentHashes = state.documentHashes.map { toDto(it) }
        )
    }

    private fun toDto(record: DocumentHashRecord): DocumentHashRecordDto = DocumentHashRecordDto(
        documentId = record.documentId,
        category = record.category,
        documentType = record.documentType,
        onChainHash = record.onChainHash.toString(),
        milestone = record.milestone.name,
        anchoredAt = record.anchoredAt.toString()
    )

}

// Handles calls made through the CordaRPCOps dynamic proxy (RPCClientProxyHandler): both
// flow-trigger calls (startFlowDynamic) and vault-query calls (vaultQueryBy) go through the
// same proxy invoke() path, so both can surface the same connection-level failures.
//
// Confirmed via javap against corda-rpc-4.10.jar / corda-core-4.10.jar:
//   - net.corda.core.flows.FlowException extends net.corda.core.CordaException (checked,
//     unrelated to RPCException) - thrown for genuine business-rule flow rejections.
//   - net.corda.client.rpc.RPCException extends net.corda.core.CordaRuntimeException -
//     thrown directly by RPCClientProxyHandler.invoke(...) for transport/connection failures
//     ("Cannot connect to server(s)...", "RPC Proxy is closed", "RPC server is not
//     available.") and also used to fail in-flight futures/observables on disconnect.
//   - net.corda.client.rpc.ConnectionFailureException extends RPCException - the specific
//     subtype RPCClientProxyHandler uses to fail outstanding futures when the underlying
//     connection drops mid-call; caught here transitively via RPCException.
//
// Kept as a top-level function (rather than a private member of RealCordaGateway) so it can be
// unit-tested directly without needing a live RpcConnections/CordaRPCConnection, which would
// otherwise require a real Corda node to construct.
internal fun <T> runRpc(block: () -> T): T {
    return try {
        block()
    } catch (e: FlowException) {
        throw FlowRejectedException(e.message ?: "Flow was rejected")
    } catch (e: RPCException) {
        throw CordaConnectionException(e.message ?: "Corda RPC connection failed", e)
    }
}

// The bank name accept-docs/settle-payment route to when the request omits `issuingBank` --
// preserves backwards compatibility for callers (like ledger-monitoring) that predate the
// multi-bank pool and only ever dealt with the original IssuingBank/AdvisingBank pair.
internal const val DEFAULT_ISSUING_BANK = "IssuingBank"

internal fun <T> resolveBank(banks: Map<String, T>, requestedBank: String?): T {
    val name = requestedBank ?: DEFAULT_ISSUING_BANK
    return banks[name] ?: throw IllegalArgumentException("Unknown bank: $name")
}

// Guards issue-lc against naming an issuingBank that exists on the Corda network map (any
// party resolveParty can find) but isn't in blockchain-layer's own RPC-connected bank pool
// (connections.banks, keyed by BANK_NAMES) -- e.g. a bank added to the Corda network but not
// yet added to BANK_NAMES. Generic over the map's value type, same reasoning as resolveBank
// above: this lets the check be unit-tested with plain Strings instead of a real
// RpcConnections/CordaRPCOps, which would require a live Corda RPC connection to construct.
internal fun <T> requireKnownBank(banks: Map<String, T>, issuingBank: String) {
    require(banks.containsKey(issuingBank)) { "Unknown bank: $issuingBank" }
}

// Guards acceptDocs/settlePayment against starting a flow on a node that was never a
// participant in the trade -- e.g. issuingBank names a bank that IS in the RPC pool but isn't
// *this trade's* actual issuing bank (including simply omitting the field for a trade issued
// by a non-default bank). Without this, the flow starts on a node with no such state in its
// vault and falls through to an unmapped exception (bare 500), hiding the real cause.
//
// Generic over T (rather than StateAndRef<TradeFinanceState> specifically) so this can be
// unit-tested with a plain nullable value instead of a real vault query result, which would
// require a live Corda RPC connection to produce -- same reasoning as resolveBank/runRpc.
internal fun <T> requireTradeOnBank(state: T?, linearId: String, bankName: String): T {
    return state ?: throw FlowRejectedException("Trade $linearId was not issued by $bankName")
}

// Resolves any party visible on the Corda network map by its X.500 organisation name --
// broader than resolveBank/connections.banks (which only covers blockchain-layer's own
// RPC-connected bank pool). Promoted to top-level so RealGuaranteeGateway can reuse it too,
// rather than duplicating the same lookup.
internal fun resolveParty(ops: CordaRPCOps, commonName: String): Party {
    val x500Name = ops.networkMapSnapshot()
        .flatMap { it.legalIdentities }
        .firstOrNull { it.name.organisation == commonName }
        ?: throw FlowRejectedException("Unknown party '$commonName'")
    return x500Name
}
