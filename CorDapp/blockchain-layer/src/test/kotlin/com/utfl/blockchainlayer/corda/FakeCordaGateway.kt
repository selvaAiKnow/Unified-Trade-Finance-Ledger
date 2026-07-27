package com.utfl.blockchainlayer.corda

class FakeCordaGateway : CordaGateway {
    var issueLCResult: FlowResult? = null
    var issueLCError: Throwable? = null
    var lastIssueLCArgs: List<Any?>? = null

    var regulatoryClearResult: FlowResult? = null
    var regulatoryClearError: Throwable? = null
    var lastRegulatoryClearArgs: List<Any?>? = null

    var shipGoodsResult: FlowResult? = null
    var shipGoodsError: Throwable? = null
    var lastShipGoodsArgs: List<Any?>? = null

    var acceptDocsResult: FlowResult? = null
    var acceptDocsError: Throwable? = null
    var lastAcceptDocsArgs: List<Any?>? = null

    var settlePaymentResult: FlowResult? = null
    var settlePaymentError: Throwable? = null
    var lastSettlePaymentArgs: List<Any?>? = null

    var regulatoryCloseResult: FlowResult? = null
    var regulatoryCloseError: Throwable? = null
    var lastRegulatoryCloseArgs: List<Any?>? = null

    var tradeToReturn: TradeStateDto? = null
    var tradesToReturn: List<TradeStateDto> = emptyList()
    var getTradeError: Throwable? = null

    override fun issueLC(
        exporter: String,
        issuingBank: String,
        advisingBank: String,
        lcReference: String,
        lcTermsDocumentId: String,
        lcTermsHash: String
    ): FlowResult {
        lastIssueLCArgs = listOf(exporter, issuingBank, advisingBank, lcReference, lcTermsDocumentId, lcTermsHash)
        issueLCError?.let { throw it }
        return issueLCResult ?: error("issueLCResult not configured")
    }

    override fun regulatoryClear(
        linearId: String,
        complianceOutcome: String,
        documentId: String,
        documentType: String,
        onChainHash: String
    ): FlowResult {
        lastRegulatoryClearArgs = listOf(linearId, complianceOutcome, documentId, documentType, onChainHash)
        regulatoryClearError?.let { throw it }
        return regulatoryClearResult ?: error("regulatoryClearResult not configured")
    }

    override fun shipGoods(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        lastShipGoodsArgs = listOf(linearId, documentId, documentType, onChainHash)
        shipGoodsError?.let { throw it }
        return shipGoodsResult ?: error("shipGoodsResult not configured")
    }

    override fun acceptDocs(linearId: String): FlowResult {
        lastAcceptDocsArgs = listOf(linearId)
        acceptDocsError?.let { throw it }
        return acceptDocsResult ?: error("acceptDocsResult not configured")
    }

    override fun settlePayment(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        lastSettlePaymentArgs = listOf(linearId, documentId, documentType, onChainHash)
        settlePaymentError?.let { throw it }
        return settlePaymentResult ?: error("settlePaymentResult not configured")
    }

    override fun regulatoryClose(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        lastRegulatoryCloseArgs = listOf(linearId, documentId, documentType, onChainHash)
        regulatoryCloseError?.let { throw it }
        return regulatoryCloseResult ?: error("regulatoryCloseResult not configured")
    }

    override fun getTrade(linearId: String): TradeStateDto {
        getTradeError?.let { throw it }
        return tradeToReturn ?: throw TradeNotFoundException(linearId)
    }

    override fun listTrades(): List<TradeStateDto> = tradesToReturn
}
