FROM eclipse-temurin:17-jre

WORKDIR /app

COPY build/libs/blockchain-layer-0.1.jar /app/blockchain-layer.jar

EXPOSE 8081

# corda-rpc's AMQP serializers reflectively access JDK-internal classes
# (e.g. java.time.ZonedDateTime.ofLenient) that JDK 17's module system
# blocks by default. This bites the moment a real CordaRPCConnection is
# opened (RealCordaGateway / RpcConnections connect eagerly on startup).
# These are the same flags applied to `test.jvmArgs` and
# `applicationDefaultJvmArgs` in blockchain-layer/build.gradle -- neither
# of which apply to `java -jar`, so they're set here via JDK_JAVA_OPTIONS,
# which the `java` launcher picks up automatically.
ENV JDK_JAVA_OPTIONS="--add-opens java.base/java.time=ALL-UNNAMED \
--add-opens java.base/java.lang=ALL-UNNAMED \
--add-opens java.base/java.util=ALL-UNNAMED \
--add-opens java.base/java.io=ALL-UNNAMED \
--add-opens java.base/java.net=ALL-UNNAMED \
--add-opens java.base/java.math=ALL-UNNAMED \
--add-opens java.base/java.security.cert=ALL-UNNAMED \
--add-opens java.base/sun.security.util=ALL-UNNAMED \
--add-opens java.base/sun.security.x509=ALL-UNNAMED"

ENTRYPOINT ["java", "-jar", "/app/blockchain-layer.jar"]
