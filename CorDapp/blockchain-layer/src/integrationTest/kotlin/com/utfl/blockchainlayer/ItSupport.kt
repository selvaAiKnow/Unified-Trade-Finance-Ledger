package com.utfl.blockchainlayer

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.delay
import kotlin.test.fail

internal suspend fun HttpClient.waitForServiceReady(
    baseUrl: String,
    timeoutMs: Long = 120_000,
    pollIntervalMs: Long = 3_000
) {
    val deadline = System.currentTimeMillis() + timeoutMs
    var lastError: String? = null
    while (System.currentTimeMillis() < deadline) {
        try {
            val response = get("$baseUrl/health")
            if (response.status == HttpStatusCode.OK) {
                return
            }
            lastError = "GET /health returned ${response.status}"
        } catch (e: Exception) {
            lastError = "GET /health failed: ${e::class.simpleName}: ${e.message}"
        }
        delay(pollIntervalMs)
    }
    fail("blockchain-layer at $baseUrl never became ready within ${timeoutMs}ms. Last error: $lastError")
}

internal fun sampleHash(): String {
    return (1..64).joinToString("") { "A" }
}
