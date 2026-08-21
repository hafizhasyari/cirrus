# Cirrus — Developer & Operator Guide

This document is for people who want to **build, deploy, or contribute to** Cirrus. If you just want to use the application (browse VM inventory, manage connections/users), see [`README.md`](README.md) instead.

## Status

The MVP is fully built and running: frontend, all 4 backend services, and all 5 provider collectors are wired to real APIs and confirmed against real successful fetches. Auth is real Microsoft Entra ID OIDC, gated behind a temporary `DEV_LOGIN_ENABLED` dev-only bypass while a separate team finishes the Entra ID app registration.

For what's already done vs. still open (CI/CD, test coverage, observability/alerting, a few known provider gaps), see [`TODO.md`](TODO.md). For the authoritative product scope and status, see [`PRD.md`](PRD.md).

## Architecture

```
Frontend SPA → API Gateway/BFF → Auth Service + RBAC Service → Inventory Aggregator → 5 Provider Collectors
```

- **Frontend**: React + TypeScript + Vite SPA, served by nginx in Docker.
- **BFF**: the only service reachable from outside the Docker network; proxies/aggregates the others.
- **Auth**: Microsoft Entra ID OIDC (Authorization Code + PKCE), single-tenant, identity keyed on `oid`+`tid`.
- **RBAC**: sole owner of PostgreSQL (users, cloud connections, audit log) and the sole Vault client.
- **Aggregator**: sole owner of Redis (per-connection cache with a stampede lock); fans out to the collectors and streams results back as NDJSON.
- **Provider Collectors**: one Go binary per provider (`aws`, `gcp`, `alibaba`, `oci`, `biznet`), each exposing a uniform `GET /instances`, isolated so a failure in one never affects the others.
- **Vault** (KV v2, production mode): backs per-connection secrets for AWS/Alibaba/OCI/Biznet. GCP uses Workload Identity Federation instead — no static secret at all.

Full architecture detail, diagrams, and the reasoning behind each decision live in [`ARCHITECTURE.md`](ARCHITECTURE.md), [`PRD.md`](PRD.md) §7, and [`CLAUDE.md`](CLAUDE.md). Database schema is in [`SCHEMA.md`](SCHEMA.md).

## Repo layout

```
frontend/                  React + TypeScript + Vite SPA
backend/
  bff/                     API Gateway / BFF (Fastify)
  auth/                    Auth Service — Entra ID OIDC (Fastify)
  rbac/                    RBAC Service — Postgres + Vault owner (Fastify)
  aggregator/              Inventory Aggregator — Redis owner (Fastify)
  shared-types/            Types shared between backend services and the frontend
  collectors/              Separate Go workspace (go.work), not an npm workspace
    internal-kit/          Shared HTTP envelope + RBAC-config-fetch helpers
    aws/ gcp/ alibaba/ oci/ biznet/   One collector binary per provider
vault/                     Vault entrypoint/config/healthcheck scripts
backup/                    Postgres/Vault backup sidecar scripts
backups/                   Backup output (gitignored, created at runtime)
docker-compose.yml         Base stack (local dev)
docker-compose.prod.yml    Production overlay
docker-compose.dev.yml     Toggles the prod stack back to dev mode for testing
PRD.md / ARCHITECTURE.md / SCHEMA.md / TODO.md / CLAUDE.md
```

## Prerequisites

- Docker + Docker Compose — the primary way to run Cirrus.
- Node.js and Go are only needed if you want to run an individual service outside Docker (see below).

## Getting started (local dev)

```bash
cp .env.example .env
# fill in ENTRA_TENANT_ID / ENTRA_CLIENT_ID / ENTRA_CLIENT_SECRET if you have them,
# or set DEV_LOGIN_ENABLED=true to skip real Entra ID login for local dev

docker compose up -d --build
```

The app is then available at `http://localhost:5173`. Database migrations and seeding run automatically on container start (idempotent) — a single bootstrap Admin is created from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_NAME`, no sample connections. Register your own cloud connections from the UI.

Don't run `npm run dev` for the frontend at the same time as the Docker stack — both use port 5173.

## Production deploy

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

This overlay drops all direct host port publishing except what Traefik needs and sets `NODE_ENV=production` for the Node services (which also closes the `DEV_LOGIN_ENABLED` bypass regardless of what's in `.env`).

A third overlay, `docker-compose.dev.yml`, toggles that *same* running production stack back to dev mode (e.g. to exercise dev-login against real data via Playwright) without standing up a second environment:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --force-recreate
# ...testing...
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --force-recreate
```

**This has a real security cost while active** — it reopens the dev-login bypass on the public domain. Always switch back to the prod overlay as soon as you're done. See `CLAUDE.md` for full detail.

## Running services individually (non-Docker dev)

```bash
# backend (from backend/)
npm install
npm run dev:bff          # or dev:auth / dev:rbac / dev:aggregator
npm run build             # tsc -b, all workspaces

# frontend (from frontend/)
npm install
npm run dev                # http://localhost:5173, proxies /api and /auth to bff
npm run lint                # oxlint
npm run build               # tsc -b && vite build

# collectors (from backend/collectors/, separate Go workspace)
go build ./...
```

`rbac` also has `db:generate` / `db:migrate` / `db:seed` for manual local DB work — in Docker these run automatically via its entrypoint, so you shouldn't normally need them yourself.

There is no automated test suite in this repo yet (no `test` script anywhere, no CI pipeline) — see `TODO.md`'s P3 section.

## Key docs

| Doc | Purpose |
|---|---|
| [`PRD.md`](PRD.md) | Product source of truth — scope, roles, architecture, roadmap |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System architecture in detail |
| [`SCHEMA.md`](SCHEMA.md) | Database schema |
| [`CLAUDE.md`](CLAUDE.md) | Implementation history, decisions, and conventions (also read by Claude Code) |
| [`TODO.md`](TODO.md) | Production-readiness status and open work |
| [`frontend/README.md`](frontend/README.md) | Frontend-specific dev notes |

## Security notes

- Secrets (AWS/Alibaba/OCI/Biznet per-connection credentials) are stored in HashiCorp Vault (KV v2, production/file-storage mode, persists across restarts) — RBAC is the only Vault client. GCP uses Workload Identity Federation and never stores a static secret.
- CORS, rate limiting, security headers, log redaction, backups, log size caps, and per-service resource limits are all in place — see `TODO.md`'s P1 section.
- Internal service-to-service TLS is an explicit, documented, accepted risk for this single-host deployment, not something left unbuilt by oversight — see `CLAUDE.md` for the reasoning and what would change that decision.

## Contributing

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`, imperative, lowercase, no trailing period. Types: `feat`, `fix`, `docs`, `refactor`, `chore` (also `perf`/`build`/`test`/`ci` if needed).
- Do not add a `Co-Authored-By: Claude` trailer to commits in this repo.
- If a change affects anything described in `PRD.md` or `CLAUDE.md` (scope, architecture, provider/auth model, what's built vs. deferred), update the relevant section(s) in the same commit so these docs stay in sync with the code.
