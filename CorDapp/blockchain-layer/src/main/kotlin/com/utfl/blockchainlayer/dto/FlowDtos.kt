package com.utfl.blockchainlayer.dto

import kotlinx.serialization.Serializable

@Serializable
data class IssueLCRequest(
    val exporter: String,
    val issuingBank: String,
    val advisingBank: String,
    val lcReference: String,
    val lcTermsDocumentId: String,
    val lcTermsHash: String
)

@Serializable
data class RegulatoryClearRequest(
    val linearId: String,
    val complianceOutcome: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)

@Serializable
data class ShipGoodsRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)

@Serializable
data class AcceptDocsRequest(val linearId: String, val issuingBank: String? = null)

@Serializable
data class SettlePaymentRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String,
    val issuingBank: String? = null
)

@Serializable
data class RegulatoryCloseRequest(
    val linearId: String,
    val documentId: String,
    val documentType: String,
    val onChainHash: String
)

@Serializable
data class FlowResultResponse(
    val linearId: String,
    val txId: String,
    val status: String
)
