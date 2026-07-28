package com.utfl.blockchainlayer.dto

import kotlinx.serialization.Serializable

@Serializable
data class IssueGuaranteeRequest(
    val beneficiary: String,
    val guarantorBank: String,
    val advisingBank: String,
    val guaranteeReference: String,
    val guaranteeTermsDocumentId: String,
    val guaranteeTermsHash: String
)

@Serializable
data class InvokeClaimRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)

@Serializable
data class PayClaimRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String,
    val guarantorBank: String? = null
)

@Serializable
data class CloseGuaranteeRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)
