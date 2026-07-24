package com.utfl.tradefinance.flows

import net.corda.core.identity.CordaX500Name
import net.corda.testing.node.MockNetwork
import net.corda.testing.node.MockNetworkNotarySpec
import net.corda.testing.node.MockNetworkParameters
import net.corda.testing.node.StartedMockNode
import org.junit.After
import org.junit.Before

// TestCordapp.findCordapp("com.utfl.tradefinance") is ambiguous: the contracts module's classes
// live directly in that package, and the workflows module's flows package
// (com.utfl.tradefinance.flows) is a sub-package of it, so a package-prefix scan for
// "com.utfl.tradefinance" matches both modules' build output jars and throws
// "There is more than one CorDapp containing the package". The legacy cordappPackages
// constructor scans each package directly without that jar-identity ambiguity check.
@Suppress("DEPRECATION")
abstract class AbstractFlowTest {
    protected lateinit var network: MockNetwork
    protected lateinit var importerNode: StartedMockNode
    protected lateinit var exporterNode: StartedMockNode
    protected lateinit var issuingBankNode: StartedMockNode
    protected lateinit var advisingBankNode: StartedMockNode

    @Before
    fun setup() {
        network = MockNetwork(
            cordappPackages = listOf("com.utfl.tradefinance", "com.utfl.tradefinance.flows"),
            parameters = MockNetworkParameters(
                notarySpecs = listOf(MockNetworkNotarySpec(CordaX500Name("Notary", "London", "GB")))
            )
        )
        importerNode = network.createPartyNode(CordaX500Name("Importer", "Mumbai", "IN"))
        exporterNode = network.createPartyNode(CordaX500Name("Exporter", "Mumbai", "IN"))
        issuingBankNode = network.createPartyNode(CordaX500Name("IssuingBank", "Tokyo", "JP"))
        advisingBankNode = network.createPartyNode(CordaX500Name("AdvisingBank", "Mumbai", "IN"))
        network.runNetwork()
    }

    @After
    fun tearDown() {
        network.stopNodes()
    }
}
