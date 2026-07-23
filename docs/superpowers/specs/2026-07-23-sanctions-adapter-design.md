# Phase 1 — Sanctions Adapter — Design

Date: 2026-07-23
Source: `docs/claude_code_build_prompt.md`, Section 6 Phase 1 ("single sanctions API integration"), Section 5 ("Sanctions Screening: Refinitiv World-Check / ComplyAdvantage / OFAC SDN API")

## Scope

This is the **second of three sub-projects** that make up Phase 1 (`api`, `sanctions-adapter`, `web`), following the same spec → plan → implementation cycle used for `api` and the earlier Corda CorDapp slice. This document covers the `sanctions-adapter` service and the small amount of work needed in the already-merged `api` codebase to actually call it.

**Explicitly out of scope for this sub-project:**
- The Consolidated (non-SDN) sanctions list, and any list beyond OFAC's SDN list
- Country/nationality-based filtering — `country` is accepted (it's part of the already-fixed `SanctionsClient` interface) but not used to filter matches in this slice
- Vessel/aircraft-specific matching nuances beyond treating them like any other SDN entry
- Any commercial vendor (Refinitiv World-Check, ComplyAdvantage) — those remain future options per Section 5, not built here
- Real async job/queue processing — screening is a synchronous HTTP call (see "Sync, not async job" below)
- The `web` portal (third sub-project)

## Platform choices

- **Python 3.11+, FastAPI**, matching the stack used by `api` and Section 5's "Python FastAPI microservices" rule.
- **Data source: OFAC's own Sanctions List Service (SDN.XML)** — Treasury's official, free, no-authentication export. Not a third-party "OFAC API" product (SanctionsLookup, ofac-api.com, Apify scrapers, etc.) — those are commercial-adjacent services sitting on top of the same public data, with reliability/terms we don't control. Using the official file directly and matching locally keeps this sub-project self-contained and dependency-free, consistent with the source doc's general preference for owned, auditable logic over black-box third parties.
- **Sync, not async job:** Section 5 describes sanctions screening as an "async job per transaction," but `api`'s already-merged `SanctionsClient` protocol (`api/app/sanctions/client.py`) is called synchronously — `await sanctions_client.screen(...)`, blocking until a result is ready. Reworking that interface into a submit/poll or webhook pattern would mean revisiting already-shipped, reviewed code for no functional benefit: OFAC SDN matching against an in-memory cache is a fast, synchronous operation (unlike a slower external commercial vendor call, which is presumably what motivated the "async job" language in the source doc). This is a deliberate, documented deviation from the doc's literal wording, not an oversight.
- No API gateway, no auth on the adapter's endpoint — internal service-to-service call within the trusted Docker Compose network, matching `api`'s own "no gateway in Phase 1" precedent. Real OAuth2/OIDC remains a documented production requirement (Section 8), not built here.

## SDN list ingestion and caching

On startup, the service downloads `SDN.XML` from OFAC's official Sanctions List Service and parses it into an in-memory list of candidate names, one entry per:
- Each SDN entry's primary name (`firstName + lastName`, or just `lastName` when `firstName` is empty — common for entities/vessels, since `sdnType` can be `Individual`, `Entity`, `Vessel`, or `Aircraft`)
- Each of that entry's `akaList/aka` aliases (`firstName + lastName` per alias)

Each candidate name carries its source entry's `sdnType` and `programList` (sanctions program(s)) for inclusion in match results. The cache refreshes on a periodic background timer (default: every 24h) rather than per-request, since the SDN list is several thousand entries and re-downloading/re-parsing per screening call would be wasteful. If a scheduled refresh fails (network issue reaching Treasury), the service keeps serving from the last successful cache rather than going empty — a transient network blip must never turn every screening call into a false `CLEAR`.

**Implementation-time verification required:** the exact current download URL and XML schema should be confirmed against `https://ofac.treasury.gov/sanctions-list-service` when this is built — live fetches against treasury.gov timed out during design research, so the URL and schema shape here are based on documented structure (`sdnList > sdnEntry > {uid, firstName, lastName, sdnType, programList, akaList, ...}`) rather than a freshly-verified live response. This is a known verification step for the implementer, not an assumption to build blindly on.

## Matching and screening logic

Input `name` is normalized (uppercased, punctuation stripped, whitespace collapsed) and compared against every cached candidate name (normalized the same way):

| Match strength | Status |
|---|---|
| Exact match (normalized strings equal) | `BLOCK` |
| Fuzzy/partial match (`difflib.SequenceMatcher(None, a, b).ratio() >= 0.85`, or one normalized name is a substring of the other) | `REVIEW` |
| No match | `CLEAR` |

`SanctionsResult.matches` lists every candidate that triggered a hit: `{name, sdn_type, program, match_kind}`. `SanctionsResult.raw` carries the full match detail for audit purposes (per Section 8's FATF-aligned audit logging requirement — this is already how `api`'s `sanctions_screenings.raw_response` column stores it). `country` is accepted per the fixed interface but not used to filter matches in this slice — a documented Phase 1 simplification, not an oversight.

## HTTP API

- `POST /screen` — request `{name: str, country: str}`, response body matching `SanctionsResult` exactly (`{status, matches, raw}`), so `api`'s HTTP client deserializes it directly into the same TypedDict shape it already uses for the fake client.
- `GET /health` — matches the pattern already established in `api`.

No authentication on this endpoint in Phase 1 (internal, trusted-network call — see Platform choices).

## Closing the loop in `api`

This sub-project also touches the already-merged `api` codebase — the one place its interface, defined back in the `api` sub-project, actually gets a real implementation:

- **Add** `api/app/sanctions/http_client.py`: `HttpSanctionsClient` implementing the `SanctionsClient` protocol. `screen()` does a `POST` to the adapter's `/screen` endpoint via `httpx.AsyncClient` and returns the parsed `SanctionsResult`.
- **Modify** `api/app/config.py`: add `sanctions_adapter_url: str | None = None`.
- **Modify** `api/app/sanctions/dependency.py`: `get_sanctions_client()` returns `HttpSanctionsClient` when `settings.sanctions_adapter_url` is set, else falls back to `FakeSanctionsClient` — every existing `api` test keeps working unchanged, since none of them set that setting.
- **Error handling:** if the adapter is unreachable, times out, or returns a non-2xx response, `HttpSanctionsClient.screen()` raises rather than silently returning `CLEAR` — a screening failure must never be mistaken for a clean result. This propagates up through `api`'s signup/screening endpoints as a 502/503, not a false-positive clear.

## Testing

- **`sanctions-adapter` tests:** parse a small fixture SDN.XML (a handful of entries, not the full multi-thousand-entry live file) into the expected candidate-name cache; exact/fuzzy/no-match grading against that fixture; `POST /screen` end-to-end via `httpx.AsyncClient` against the fixture-backed cache.
- **`api`-side tests:** `HttpSanctionsClient` tested against a mocked HTTP response (`respx` or `httpx`'s built-in mock transport) — not a live adapter instance — consistent with how `api`'s existing tests avoid live external dependencies (a real Postgres/MinIO via Docker Compose, but no real network calls to third parties).
- Existing `api` tests (which all rely on `FakeSanctionsClient` via an unset `sanctions_adapter_url`) must continue passing unchanged.

## Non-functional notes carried from the source doc

- No PII beyond a screened name/country ever leaves the trusted network boundary — the adapter has no database, no persistence beyond its in-memory SDN cache (which is public government data, not PII).
- Audit logging (Section 8): the `raw` field in every `SanctionsResult` is the audit record; `api` already persists it (`sanctions_screenings.raw_response`, `kyb_checks.detail`).
- Key management / HSM: not applicable — this service holds no secrets or private keys.

## Explicitly deferred to later phases

- Consolidated (non-SDN) list and any additional watchlists
- Country/nationality-based match filtering
- Commercial vendor integration (Refinitiv, ComplyAdvantage) as an alternative or supplement
- Async job/queue-based screening (if a future vendor's latency requires it)
- Rate limiting / retries / circuit-breaking on the OFAC download (Phase 1 assumes a reasonably reliable, infrequent download; production hardening is future work)
