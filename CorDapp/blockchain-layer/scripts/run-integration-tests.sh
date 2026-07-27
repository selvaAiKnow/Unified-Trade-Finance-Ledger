#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/../../docker"
BLOCKCHAIN_LAYER_DIR="$SCRIPT_DIR/.."
HEALTH_URL="${BLOCKCHAIN_LAYER_URL:-http://localhost:8081}/health"
READINESS_TIMEOUT_SECONDS=120
READINESS_POLL_INTERVAL_SECONDS=5

cd "$DOCKER_DIR"

echo "Starting Docker Compose network..."
docker compose up -d --build --wait

# `--wait` above only confirms containers reached "running" state. It does NOT
# confirm blockchain-layer's Ktor HTTP server is listening: blockchain-layer
# connects to all 4 Corda nodes' RPC eagerly on startup and doesn't open port
# 8081 until all 4 succeed, and Corda's RPC listeners take ~35-48s to come up,
# so blockchain-layer reliably crash-loops a few times first (see
# `restart: on-failure` in docker-compose.yml). There is no Docker healthcheck
# defined for blockchain-layer, so Compose has no way to wait for this itself.
# Poll /health here before invoking the test suite so a cold `docker compose up`
# doesn't race the integration test's first HTTP call against a restart window.
echo "Waiting for blockchain-layer to report healthy at $HEALTH_URL (timeout ${READINESS_TIMEOUT_SECONDS}s)..."
elapsed=0
until curl -sf "$HEALTH_URL" > /dev/null 2>&1; do
    if [ "$elapsed" -ge "$READINESS_TIMEOUT_SECONDS" ]; then
        echo "blockchain-layer did not become healthy within ${READINESS_TIMEOUT_SECONDS}s." >&2
        echo "Recent blockchain-layer logs:" >&2
        docker compose logs --tail=100 blockchain-layer >&2 || true
        docker compose down
        exit 1
    fi
    sleep "$READINESS_POLL_INTERVAL_SECONDS"
    elapsed=$((elapsed + READINESS_POLL_INTERVAL_SECONDS))
done
echo "blockchain-layer is healthy after ${elapsed}s."

echo "Running integration tests..."
cd "$BLOCKCHAIN_LAYER_DIR"
set +e
./gradlew integrationTest
TEST_EXIT_CODE=$?
set -e

echo "Tearing down Docker Compose network..."
cd "$DOCKER_DIR"
docker compose down

exit $TEST_EXIT_CODE
