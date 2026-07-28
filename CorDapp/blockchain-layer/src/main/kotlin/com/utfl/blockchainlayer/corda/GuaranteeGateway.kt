package com.utfl.blockchainlayer.corda

import kotlinx.serialization.Serializable

@Serializable
data class GuaranteeStateDto(
    val linearId: String,
    val guaranteeReference: String,
    val applicant: String,
    val beneficiary: String,
    val guarantorBank: String,
    val advisingBank: String,
    val guaranteeTermsHash: String,
    val status: String,
    val documentHashes: List<DocumentHashRecordDto>
)

interface GuaranteeGateway {
    fun issueGuarantee(
        beneficiary: String,
        guarantorBank: String,
        advisingBank: String,
        guaranteeReference: String,
        guaranteeTermsDocumentId: String,
        guaranteeTermsHash: String
    ): FlowResult

    fun invokeClaim(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun payClaim(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String,
        guarantorBank: String? = null
    ): FlowResult

    fun closeGuarantee(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult

    fun getGuarantee(linearId: String): GuaranteeStateDto

    fun listGuarantees(): List<GuaranteeStateDto>
}
