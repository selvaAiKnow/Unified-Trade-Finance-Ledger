package com.utfl.blockchainlayer.corda

class FakeGuaranteeGateway : GuaranteeGateway {
    var issueGuaranteeResult: FlowResult? = null
    var issueGuaranteeError: Throwable? = null
    var lastIssueGuaranteeArgs: List<Any?>? = null

    var invokeClaimResult: FlowResult? = null
    var invokeClaimError: Throwable? = null
    var lastInvokeClaimArgs: List<Any?>? = null

    var payClaimResult: FlowResult? = null
    var payClaimError: Throwable? = null
    var lastPayClaimArgs: List<Any?>? = null

    var closeGuaranteeResult: FlowResult? = null
    var closeGuaranteeError: Throwable? = null
    var lastCloseGuaranteeArgs: List<Any?>? = null

    var guaranteeToReturn: GuaranteeStateDto? = null
    var guaranteesToReturn: List<GuaranteeStateDto> = emptyList()
    var getGuaranteeError: Throwable? = null

    override fun issueGuarantee(
        beneficiary: String,
        guarantorBank: String,
        advisingBank: String,
        guaranteeReference: String,
        guaranteeTermsDocumentId: String,
        guaranteeTermsHash: String
    ): FlowResult {
        lastIssueGuaranteeArgs = listOf(beneficiary, guarantorBank, advisingBank, guaranteeReference, guaranteeTermsDocumentId, guaranteeTermsHash)
        issueGuaranteeError?.let { throw it }
        return issueGuaranteeResult ?: error("issueGuaranteeResult not configured")
    }

    override fun invokeClaim(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        lastInvokeClaimArgs = listOf(linearId, documentId, documentType, onChainHash)
        invokeClaimError?.let { throw it }
        return invokeClaimResult ?: error("invokeClaimResult not configured")
    }

    override fun payClaim(
        linearId: String,
        documentId: String,
        documentType: String,
        onChainHash: String,
        guarantorBank: String?
    ): FlowResult {
        lastPayClaimArgs = listOf(linearId, documentId, documentType, onChainHash, guarantorBank)
        payClaimError?.let { throw it }
        return payClaimResult ?: error("payClaimResult not configured")
    }

    override fun closeGuarantee(linearId: String, documentId: String, documentType: String, onChainHash: String): FlowResult {
        lastCloseGuaranteeArgs = listOf(linearId, documentId, documentType, onChainHash)
        closeGuaranteeError?.let { throw it }
        return closeGuaranteeResult ?: error("closeGuaranteeResult not configured")
    }

    override fun getGuarantee(linearId: String): GuaranteeStateDto {
        getGuaranteeError?.let { throw it }
        return guaranteeToReturn ?: throw GuaranteeNotFoundException(linearId)
    }

    override fun listGuarantees(): List<GuaranteeStateDto> = guaranteesToReturn
}
