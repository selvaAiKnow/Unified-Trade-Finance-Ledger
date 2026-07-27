package com.utfl.blockchainlayer.corda

import kotlinx.serialization.Serializable

data class FlowResult(
    val linearId: String,
    val txId: String,
    val status: String
)

@Serializable
data class DocumentHashRecordDto(
    val documentId: String,
    val category: String,
    val documentType: String,
    val onChainHash: String,
    val milestone: String,
    val anchoredAt: String
)

@Serializable
data class TradeStateDto(
    val linearId: String,
    val lcReference: String,
    val importer: String,
    val exporter: String,
    val issuingBank: String,
    val advisingBank: String,
    val lcTermsHash: String,
    val status: String,
    val complianceOutcome: String?,
    val documentHashes: List<DocumentHashRecordDto>
)

interface CordaGateway {
    fun issueLC(
        exporter: String,
        issuingBank: String,
        advisingBank: String,
        lcReference: String,
        lcTermsDocumentId: String,
        lcTermsHash: String
    ): FlowResult

    fun regulatoryClear(
        linearId: String,
        complianceOutcome: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun shipGoods(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun acceptDocs(linearId: String): FlowResult

    fun settlePayment(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun regulatoryClose(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun getTrade(linearId: String): TradeStateDto

    fun listTrades(): List<TradeStateDto>
}
