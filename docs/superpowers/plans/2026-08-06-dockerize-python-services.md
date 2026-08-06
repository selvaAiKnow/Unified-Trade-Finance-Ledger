# Dockerize Python Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 4 real Python/FastAPI services (`api`, `sanctions-adapter`, `risk-scoring`, `ledger-monitoring`) runnable with a single `docker compose up`, so the user doesn't need to manually activate 4 separate venvs to start the backend stack.

**Architecture:** Each service gets its own minimal `Dockerfile` (python:3.11-slim, `pip install -r requirements.txt`, `uvicorn --reload`) and `.dockerignore`. All 4 are added as services to the existing `infra/docker-compose.yml`, alongside the MinIO service already defined there, so they share one Docker network and MinIO is reachable by service name. Postgres stays native (the user's existing local install) — the `api` container reaches it via `host.docker.internal`. Source directories are bind-mounted into each container so edits reload live via `--reload`, matching the current local dev loop. `web`/`admin-web` (TypeScript) and `CorDapp` (already has its own Docker setup) are out of scope.

**Tech Stack:** Docker, Docker Compose, Python 3.11, FastAPI/uvicorn (existing).

## Global Constraints

- Only `api`, `sanctions-adapter`, `risk-scoring`, `ledger-monitoring` get Dockerized. `compliance-service`, `decision-engine`, `document-intelligence`, `packages` are empty README-only stubs — do not touch them. `web`, `admin-web`, `CorDapp` are explicitly out of scope.
- One compose file: extend `infra/docker-compose.yml` (do not create a second compose file). Do not modify the existing `postgres` or `minio` service definitions in that file.
- Ports: `api` → 8000, `sanctions-adapter` → 8001, `risk-scoring` → 8002, `ledger-monitoring` → 8090. These match what's already documented/used elsewhere in the repo (web/admin-web's `VITE_API_BASE_URL=http://localhost:8000`, `risk-scoring/README.md`, `ledger-monitoring/README.md`).
- Postgres stays native (the user's existing local Postgres, not the dormant `infra-postgres-1` container). The `api` container reaches it via `HOST=host.docker.internal`, with `extra_hosts: ["host.docker.internal:host-gateway"]` added for Linux Docker Engine portability (a no-op on Docker Desktop for Windows/Mac, which resolves `host.docker.internal` automatically).
- MinIO is already containerized (`infra-minio-1`, defined in `infra/docker-compose.yml`). The `api` container talks to it via the compose network using the service name (`MINIO_ENDPOINT=minio:9000`), not `localhost`.
- `ledger-monitoring`'s `blockchain_layer_url` points at CorDapp's `blockchain-layer`, which lives in a separate compose project (`CorDapp/docker/docker-compose.yml`) and is out of scope here. Override it to `http://host.docker.internal:8081` (same value it already defaults to when run natively, just reachable from inside a container) with the same `extra_hosts` entry.
- `sanctions-adapter` and `risk-scoring` need no environment overrides — no host-networked dependencies.
- Every Dockerfile uses `python:3.11-slim`, installs from that service's `requirements.txt` only (never `requirements-dev.txt` — matches this session's established venv-setup convention), and does NOT create a venv inside the container (global `pip install`) — this is what makes the bind-mount-over-`/app` dev pattern safe: installed packages live in site-packages, not under `/app`, so mounting the host source tree over `/app` at runtime can't shadow them.
- Each service's own test suite is out of scope for this change — this only makes the servers runnable via Docker; tests still run locally via each `venv`, unchanged.
- All 4 services already expose `GET /health` returning `{"status": "ok"}` — use this as the verification endpoint for every task.

---

### Task 1: Dockerize `api`

**Files:**
- Create: `api/Dockerfile`
- Create: `api/.dockerignore`
- Modify: `infra/docker-compose.yml` (add `api` service)

**Interfaces:**
- Consumes: `api/requirements.txt` (existing, unmodified), `api/.env` (existing, unmodified — `HOST` is overridden by the compose `environment:` block, which takes precedence over `.env` because `python-dotenv`'s `load_dotenv()` in `api/app/config.py` does not override already-set environment variables).
- Produces: `api` container reachable at `http://localhost:8000`, with `/health` responding `{"status": "ok"}`.

- [ ] **Step 1: Create `api/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

- [ ] **Step 2: Create `api/.dockerignore`**

```
venv/
.venv/
__pycache__/
*.pyc
.pytest_cache/
.git/
```

- [ ] **Step 3: Add the `api` service to `infra/docker-compose.yml`**

Add this service block under `services:`, alongside the existing `postgres` and `minio` services (leave those two untouched):

```yaml
  api:
    build:
      context: ../api
    ports:
      - "8000:8000"
    environment:
      HOST: host.docker.internal
      MINIO_ENDPOINT: minio:9000
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ../api:/app
    depends_on:
      - minio
```

- [ ] **Step 4: Build and run just this service**

Run: `docker compose -f infra/docker-compose.yml up --build api`
Expected: image builds successfully, container starts, logs show uvicorn listening on `0.0.0.0:8000` with no startup exceptions.

- [ ] **Step 5: Verify health and DB/MinIO connectivity**

Run (from another terminal, while the container is up): `curl http://localhost:8000/health`
Expected: `{"status":"ok"}`

Run: `curl http://localhost:8000/docs` (or any endpoint that touches the DB, e.g. an existing login/auth endpoint with a real request) to confirm the container can actually reach the native Postgres via `host.docker.internal` — a DB connectivity failure would surface as a 500 on first DB-touching request, not at container startup (SQLAlchemy connects lazily).
Expected: no connection errors in the container logs when a DB-touching request is made.

Stop the container: `docker compose -f infra/docker-compose.yml down`

- [ ] **Step 6: Commit**

```bash
git add api/Dockerfile api/.dockerignore infra/docker-compose.yml
git commit -m "Add Docker support for the api service"
```

---

### Task 2: Dockerize `sanctions-adapter`

**Files:**
- Create: `sanctions-adapter/Dockerfile`
- Create: `sanctions-adapter/.dockerignore`
- Modify: `infra/docker-compose.yml` (add `sanctions-adapter` service)

**Interfaces:**
- Consumes: `sanctions-adapter/requirements.txt` (existing, unmodified).
- Produces: `sanctions-adapter` container reachable at `http://localhost:8001`, with `/health` responding `{"status": "ok"}`.

- [ ] **Step 1: Create `sanctions-adapter/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
```

- [ ] **Step 2: Create `sanctions-adapter/.dockerignore`**

```
venv/
.venv/
__pycache__/
*.pyc
.pytest_cache/
.git/
```

- [ ] **Step 3: Add the `sanctions-adapter` service to `infra/docker-compose.yml`**

```yaml
  sanctions-adapter:
    build:
      context: ../sanctions-adapter
    ports:
      - "8001:8001"
    volumes:
      - ../sanctions-adapter:/app
```

- [ ] **Step 4: Build and run just this service**

Run: `docker compose -f infra/docker-compose.yml up --build sanctions-adapter`
Expected: image builds successfully, container starts, logs show uvicorn listening on `0.0.0.0:8001`, and the startup SDN-cache refresh (`sdn_cache.refresh_safely()` in the lifespan handler) completes without an unhandled exception (a network failure fetching the real OFAC SDN list is caught by `refresh_safely` and logged, not fatal — confirm the container stays up either way).

- [ ] **Step 5: Verify health**

Run: `curl http://localhost:8001/health`
Expected: `{"status":"ok"}`

Stop the container: `docker compose -f infra/docker-compose.yml down`

- [ ] **Step 6: Commit**

```bash
git add sanctions-adapter/Dockerfile sanctions-adapter/.dockerignore infra/docker-compose.yml
git commit -m "Add Docker support for the sanctions-adapter service"
```

---

### Task 3: Dockerize `risk-scoring`

**Files:**
- Create: `risk-scoring/Dockerfile`
- Create: `risk-scoring/.dockerignore`
- Modify: `infra/docker-compose.yml` (add `risk-scoring` service)

**Interfaces:**
- Consumes: `risk-scoring/requirements.txt` (existing, unmodified — includes `scikit-learn`, `numpy`, `joblib`, so this image build takes noticeably longer than the others).
- Produces: `risk-scoring` container reachable at `http://localhost:8002`, with `/health` responding `{"status": "ok"}`.

- [ ] **Step 1: Create `risk-scoring/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002", "--reload"]
```

- [ ] **Step 2: Create `risk-scoring/.dockerignore`**

Note: do NOT ignore `model/` here — `risk_model.joblib` is gitignored (per the repo's `.gitignore`) but must still reach the container. Since `../risk-scoring:/app` is bind-mounted at runtime (Step 3 below), whatever's on disk in `risk-scoring/model/` at container start is what the running container sees, regardless of `.dockerignore` (which only affects the image build context, not the runtime bind mount).

```
venv/
.venv/
__pycache__/
*.pyc
.pytest_cache/
.git/
```

- [ ] **Step 3: Add the `risk-scoring` service to `infra/docker-compose.yml`**

```yaml
  risk-scoring:
    build:
      context: ../risk-scoring
    ports:
      - "8002:8002"
    volumes:
      - ../risk-scoring:/app
```

- [ ] **Step 4: Build and run just this service**

Run: `docker compose -f infra/docker-compose.yml up --build risk-scoring`
Expected: image builds successfully (allow extra time for `scikit-learn`/`numpy` wheels to install), container starts, logs show uvicorn listening on `0.0.0.0:8002`.

- [ ] **Step 5: Verify health**

Run: `curl http://localhost:8002/health`
Expected: `{"status":"ok"}`

If `risk-scoring/model/risk_model.joblib` exists on disk on the host, also run the example from `risk-scoring/README.md`:
```bash
curl -X POST http://localhost:8002/risk-score \
  -H "Content-Type: application/json" \
  -d '{"exporterCountry":"IN","buyerCountry":"NG","buyerIndustry":"commodities","buyerKybStatus":"PENDING","orderValue":250000,"paymentTerm":"USANCE_90"}'
```
Expected: a scored response (or, if no trained model file exists on the host, a `503 Risk model not loaded -- run training first` — this is expected/correct behavior, not a Docker bug, and matches what happens running the service natively without a trained model).

Stop the container: `docker compose -f infra/docker-compose.yml down`

- [ ] **Step 6: Commit**

```bash
git add risk-scoring/Dockerfile risk-scoring/.dockerignore infra/docker-compose.yml
git commit -m "Add Docker support for the risk-scoring service"
```

---

### Task 4: Dockerize `ledger-monitoring`

**Files:**
- Create: `ledger-monitoring/Dockerfile`
- Create: `ledger-monitoring/.dockerignore`
- Modify: `infra/docker-compose.yml` (add `ledger-monitoring` service)

**Interfaces:**
- Consumes: `ledger-monitoring/requirements.txt` (existing, unmodified).
- Produces: `ledger-monitoring` container reachable at `http://localhost:8090`, with `/health` responding `{"status": "ok"}`.

- [ ] **Step 1: Create `ledger-monitoring/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090", "--reload"]
```

- [ ] **Step 2: Create `ledger-monitoring/.dockerignore`**

```
venv/
.venv/
__pycache__/
*.pyc
.pytest_cache/
.git/
```

- [ ] **Step 3: Add the `ledger-monitoring` service to `infra/docker-compose.yml`**

```yaml
  ledger-monitoring:
    build:
      context: ../ledger-monitoring
    ports:
      - "8090:8090"
    environment:
      BLOCKCHAIN_LAYER_URL: http://host.docker.internal:8081
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ../ledger-monitoring:/app
```

- [ ] **Step 4: Build and run just this service**

Run: `docker compose -f infra/docker-compose.yml up --build ledger-monitoring`
Expected: image builds successfully, container starts, logs show uvicorn listening on `0.0.0.0:8090`.

- [ ] **Step 5: Verify health**

Run: `curl http://localhost:8090/health`
Expected: `{"status":"ok"}`
(This must pass regardless of whether CorDapp's `blockchain-layer` is running — `blockchain_layer_url` is only touched by the `/events/*` routes, not by `/health`.)

Stop the container: `docker compose -f infra/docker-compose.yml down`

- [ ] **Step 6: Commit**

```bash
git add ledger-monitoring/Dockerfile ledger-monitoring/.dockerignore infra/docker-compose.yml
git commit -m "Add Docker support for the ledger-monitoring service"
```

---

### Task 5: Full-stack verification and hot-reload check

**Files:**
- None created or modified — this task is pure verification of the combined result of Tasks 1-4.

**Interfaces:**
- Consumes: all services and the `minio` service defined in `infra/docker-compose.yml` by the end of Task 4.
- Produces: nothing new — confirms the whole stack from Tasks 1-4 works together, which no single per-service task could confirm on its own (shared network, combined `docker compose up`, live-reload behavior).

- [ ] **Step 1: Bring up the full stack**

Run: `docker compose -f infra/docker-compose.yml up --build`
Expected: `minio`, `api`, `sanctions-adapter`, `risk-scoring`, and `ledger-monitoring` all start with no errors or restart loops. (The pre-existing `postgres` service in this file is not required to start cleanly for this verification — it stays unused/stopped per this plan's Global Constraints; if `docker compose up` without arguments also starts it, that's fine, just confirm it doesn't block the other services from starting.)

- [ ] **Step 2: Verify all four health endpoints in one pass**

Run:
```bash
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8090/health
```
Expected: all four return `{"status":"ok"}`.

- [ ] **Step 3: Verify `api` can reach both the native Postgres and the containerized MinIO from inside the compose network**

Run a request against an `api` endpoint that touches both — e.g. the existing document-upload flow, or at minimum an authenticated request that requires a DB read (e.g. login with a known test user, if one exists in the local dev DB) — via `curl http://localhost:8000/...`.
Expected: no 500s attributable to DB or MinIO connectivity in the `api` container's logs (`docker compose -f infra/docker-compose.yml logs api`).

- [ ] **Step 4: Verify hot-reload works**

While the stack from Step 1 is still running, make a trivial, reversible edit to `api/app/main.py` (e.g. temporarily change the `/health` response to `{"status": "ok", "check": "reload-test"}`), save it, and re-run `curl http://localhost:8000/health`.
Expected: the response reflects the edit within a few seconds, with no container restart needed (uvicorn's `--reload` picks up the change via the bind-mounted source).
Revert the edit immediately after confirming (`git checkout -- api/app/main.py`), and confirm `curl http://localhost:8000/health` goes back to `{"status":"ok"}`.

- [ ] **Step 5: Tear down**

Run: `docker compose -f infra/docker-compose.yml down`
Expected: all containers stop cleanly.

- [ ] **Step 6: No commit needed**

This task is verification-only (Step 4's edit is reverted in-place, not committed). If Steps 1-4 reveal a bug in any of the Task 1-4 Dockerfiles or compose entries, fix it in the relevant task's files and amend that task's commit rather than adding a new one here.

---
