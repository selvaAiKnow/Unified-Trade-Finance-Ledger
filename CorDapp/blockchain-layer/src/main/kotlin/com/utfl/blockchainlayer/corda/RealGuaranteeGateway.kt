package com.utfl.blockchainlayer.corda

import com.utfl.tradefinance.GuaranteeDocumentHashRecord
import com.utfl.tradefinance.GuaranteeState
import com.utfl.tradefinance.flows.CloseGuaranteeFlow
import com.utfl.tradefinance.flows.InvokeClaimFlow
import com.utfl.tradefinance.flows.IssueGuaranteeFlow
import com.utfl.tradefinance.flows.PayClaimFlow
import net.corda.core.contracts.StateAndRef
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.crypto.SecureHash
import net.corda.core.messaging.CordaRPCOps
import net.corda.core.messaging.vaultQueryBy
import net.corda.core.node.services.Vault
import net.corda.core.node.services.vault.QueryCriteria
import net.corda.core.transactions.SignedTransaction
import net.corda.core.utilities.getOrThrow

class RealGuaranteeGateway(private val connections: RpcConnections) : GuaranteeGateway {

    override fun issueGuarantee(
        beneficiary: String,
        guarantorBank: String,
        advisingBank: String,
        guaranteeReference: String,
        guaranteeTermsDocumentId: String,
        guaranteeTermsHash: String
    ): FlowResult {
        val ops = connections.importer
        val beneficiaryParty = resolveParty(ops, beneficiary)
        val guarantorBankParty = resolveParty(ops, guarantorBank)
        val advisingBankParty = resolveParty(ops, advisingBank)
        // Same reasoning as issueLC in RealCordaGateway.kt: guarantorBank must be a bank
        // blockchain-layer actually has an RPC connection for, not merely a party that exists
        // on the Corda network map -- otherwise pay-claim would permanently fail for this
        // guarantee with "Unknown bank: <name>".
        requireKnownBank(connections.banks, guarantorBank)

        val stx = runRpc {
            ops.startFlowDynamic(
                IssueGuaranteeFlow.Initiator::class.java,
                guarantorBankParty,
                beneficiaryParty,
                advisingBankParty,
                guaranteeReference,
                guaranteeTermsDocumentId,
                SecureHash.parse(guaranteeTermsHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun invokeClaim(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.exporter
        val stx = runRpc {
            ops.startFlowDynamic(
                InvokeClaimFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun payClaim(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String,
        guarantorBank: String?
    ): FlowResult {
        val bankName = guarantorBank ?: DEFAULT_ISSUING_BANK
        val ops = resolveBank(connections.banks, guarantorBank)
        // UniqueIdentifier.fromString stays outside runRpc/requireTradeOnBank so a malformed
        // linearId still surfaces as its own 400, mirroring acceptDocs/settlePayment.
        val id = UniqueIdentifier.fromString(linearId)
        requireTradeOnBank(runRpc { queryOneGuarantee(ops, id) }, linearId, bankName)
        val stx = runRpc {
            ops.startFlowDynamic(
                PayClaimFlow.Initiator::class.java,
                id,
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun closeGuarantee(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        val ops = connections.importer
        val stx = runRpc {
            ops.startFlowDynamic(
                CloseGuaranteeFlow.Initiator::class.java,
                UniqueIdentifier.fromString(linearId),
                documentId,
                documentType,
                SecureHash.parse(onChainHash)
            ).returnValue.getOrThrow()
        }
        return toFlowResult(stx)
    }

    override fun getGuarantee(linearId: String): GuaranteeStateDto {
        val id = UniqueIdentifier.fromString(linearId)
        val stateAndRef = runRpc { queryOneGuarantee(connections.importer, id) }
            ?: throw GuaranteeNotFoundException(linearId)
        return toDto(stateAndRef)
    }

    override fun listGuarantees(): List<GuaranteeStateDto> {
        val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
        return runRpc { connections.importer.vaultQueryBy<GuaranteeState>(criteria).states.map { toDto(it) } }
    }

    private fun queryOneGuarantee(ops: CordaRPCOps, linearId: UniqueIdentifier): StateAndRef<GuaranteeState>? {
        val criteria = QueryCriteria.LinearStateQueryCriteria(
            linearId = listOf(linearId),
            status = Vault.StateStatus.UNCONSUMED
        )
        return ops.vaultQueryBy<GuaranteeState>(criteria).states.singleOrNull()
    }

    private fun toFlowResult(stx: SignedTransaction): FlowResult {
        val state = stx.tx.outputsOfType<GuaranteeState>().single()
        return FlowResult(
            linearId = state.linearId.id.toString(),
            txId = stx.id.toString(),
            status = state.status.name
        )
    }

    private fun toDto(stateAndRef: StateAndRef<GuaranteeState>): GuaranteeStateDto {
        val state = stateAndRef.state.data
        return GuaranteeStateDto(
            linearId = state.linearId.id.toString(),
            guaranteeReference = state.guaranteeReference,
            applicant = state.applicant.name.organisation,
            beneficiary = state.beneficiary.name.organisation,
            guarantorBank = state.guarantorBank.name.organisation,
            advisingBank = state.advisingBank.name.organisation,
            guaranteeTermsHash = state.guaranteeTermsHash.toString(),
            status = state.status.name,
            documentHashes = state.documentHashes.map { toDto(it) }
        )
    }

    private fun toDto(record: GuaranteeDocumentHashRecord): DocumentHashRecordDto = DocumentHashRecordDto(
        documentId = record.documentId,
        category = record.category,
        documentType = record.documentType,
        onChainHash = record.onChainHash.toString(),
        milestone = record.milestone.name,
        anchoredAt = record.anchoredAt.toString()
    )
}
