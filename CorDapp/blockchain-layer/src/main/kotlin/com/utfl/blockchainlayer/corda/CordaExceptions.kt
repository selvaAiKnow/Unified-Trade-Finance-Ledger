package com.utfl.blockchainlayer.corda

class TradeNotFoundException(linearId: String) : RuntimeException("No trade found with linearId=$linearId")

class GuaranteeNotFoundException(linearId: String) : RuntimeException("No guarantee found with linearId=$linearId")

class FlowRejectedException(message: String) : RuntimeException(message)

class CordaConnectionException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
