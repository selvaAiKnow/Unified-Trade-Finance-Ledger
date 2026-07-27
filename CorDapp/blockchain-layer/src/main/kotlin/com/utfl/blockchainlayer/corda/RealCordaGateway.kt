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

        val stx = runFlow {
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
        val stx = runFlow {
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
        val stx = runFlow {
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

    override fun acceptDocs(linearId: String): FlowResult {
        val ops = connections.issuingBank
        val stx = runFlow {
            ops.startFlowDynamic(
                AcceptDocsFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun settlePayment(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.issuingBank
        val stx = runFlow {
            ops.startFlowDynamic(
                SettlePaymentFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun regulatoryClose(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.importer
        val stx = runFlow {
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
        val stateAndRef = queryOne(connections.importer, UniqueIdentifier.fromString(linearId))
            ?: throw TradeNotFoundException(linearId)
        return toDto(stateAndRef)
    }

    override fun listTrades(): List<TradeStateDto> {
        val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
        return connections.importer.vaultQueryBy<TradeFinanceState>(criteria).states.map { toDto(it) }
    }

    private fun queryOne(ops: CordaRPCOps, linearId: UniqueIdentifier): StateAndRef<TradeFinanceState>? {
        val criteria = QueryCriteria.LinearStateQueryCriteria(
            linearId = listOf(linearId),
            status = Vault.StateStatus.UNCONSUMED
        )
        return ops.vaultQueryBy<TradeFinanceState>(criteria).states.singleOrNull()
    }

    private fun resolveParty(ops: CordaRPCOps, commonName: String): Party {
        val x500Name = ops.networkMapSnapshot()
            .flatMap { it.legalIdentities }
            .firstOrNull { it.name.organisation == commonName }
            ?: throw FlowRejectedException("Unknown party '$commonName'")
        return x500Name
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

    private fun <T> runFlow(block: () -> T): T {
        return try {
            block()
        } catch (e: FlowException) {
            throw FlowRejectedException(e.message ?: "Flow was rejected")
        }
    }
}
