# Cirrus — Production Readiness TODO

Checklist to take Cirrus from "works in local Docker Compose" to "safe to run in production." Target deployment is the **existing Docker Compose + Traefik setup** (see `docker-compose.yml` — already has a real domain, `cirrus.example.com`, with Let's Encrypt TLS at the edge). This is a deliberate choice: `PRD.md` §8 names Kubernetes as the long-term target, but Compose+Traefik is what's actually wired up today, so it's the near-term production path — Kubernetes stays on the list below as roadmap, not a blocker.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together and [CLAUDE.md](CLAUDE.md) for the full incident/decision history behind the feature gaps in P4.

## P0 — Blockers (must fix before going live)

- [ ] Get the real Microsoft Entra ID app registration (`ENTRA_TENANT_ID`/`ENTRA_CLIENT_ID`/`ENTRA_CLIENT_SECRET`) and wire it into `.env` — real login doesn't work without it.
- [ ] Confirm `DEV_LOGIN_ENABLED=false` in production `.env`, and consider removing/disabling the `/dev-login` route (`backend/auth/src/routes/devLogin.ts`) entirely in the prod build rather than relying on convention.
- [ ] Replace every insecure baked-in default in `docker-compose.yml` (`${INTERNAL_SHARED_SECRET:-dev-internal-secret}`, `${COOKIE_SECRET:-dev-cookie-secret-change-me}`, `${POSTGRES_PASSWORD:-cirrus_dev}`) with real generated secrets in `.env` — ideally make the services fail to start on a missing/default value instead of silently falling back.
- [ ] Fix the Vault bootstrap: `vault/entrypoint.sh` currently writes all 5 unseal keys + the root token to `/vault/file/.cirrus-init/init.txt`, **inside the same `vault-file` volume that holds the encrypted secret data** — this defeats Shamir separation-of-duty (anyone with volume access gets both the lock and the key). Move that file to a separately-secured location, and purge/rotate the root token + unseal keys already printed once to `docker compose logs vault` on first boot.
- [ ] Stop publishing Postgres (5432), Redis (6379), and Vault (8200) ports directly to the host in `docker-compose.yml` — they should only be reachable on the internal Docker network.
- [ ] Set `NODE_ENV=production` for `bff`/`auth`/`rbac`/`aggregator`, and add a `setErrorHandler` in each (none exist today) so Fastify's default handler never leaks a raw error message/stack trace to a client response.
- [ ] Add `restart: unless-stopped` to every service in `docker-compose.yml` — none have a restart policy today, so a crash stays down until someone notices and runs `docker compose up` manually.
- [ ] Add healthchecks (+ `depends_on: condition: service_healthy`) for `bff`, `frontend`, and the 5 collector services (`collector-aws/gcp/alibaba/oci/biznet`) — today only postgres/redis/vault/rbac/auth/aggregator have them; the rest are `depends_on: service_started` only.

## P1 — Security hardening

- [ ] Add an explicit CORS policy to `bff` (`@fastify/cors` or manual) — currently absent entirely; works today only because nginx same-origin-proxies `/api`/`/auth`.
- [ ] Add rate limiting (`@fastify/rate-limit` or equivalent) on `auth`'s `/login`/`/dev-login` and on `bff`'s general `/api/*` — nothing throttles login attempts today.
- [ ] Add security headers (`@fastify/helmet`) across `bff`/`auth`/`rbac`/`aggregator`, and review/add equivalent headers in `frontend/nginx.conf` (no CSP/HSTS/X-Frame-Options anywhere today).
- [ ] Configure Fastify/pino log redaction for cookies, `Authorization` headers, and session/JWT values, and wire a `LOG_LEVEL` env var — every service currently does `Fastify({ logger: true })` with default settings, which can log sensitive values verbatim.
- [ ] Decide and document whether the fully plaintext internal service mesh (frontend↔bff↔auth/rbac/aggregator↔collectors, rbac↔vault, plus Vault's own `tls_disable = 1` in `vault/config.hcl`) is an accepted risk behind Traefik, or add internal TLS.
- [ ] Add a backup procedure for the Postgres `pgdata` volume (e.g. scheduled `pg_dump`) and a separate, secured backup of Vault's `vault-file` volume — decoupled from wherever the unseal keys end up per the P0 fix above. No backup/restore mechanism exists today for either.
- [ ] Add `logging:` driver config (size/file caps) to every service in `docker-compose.yml` — currently unbounded `json-file`, so container logs can grow without limit.
- [ ] Add `deploy.resources` (cpu/mem) limits per service — none exist today, so one runaway container (e.g. a collector stuck in a retry loop) could starve the host.

## P2 — Reliability & observability

- [ ] Build the periodic connection health-check job that PRD §6.1 calls for (recommended every 6h) — today `POST /api/connections/:id/test` is manual/on-demand only, so a connection that goes bad shows stale "Active" status until someone notices or re-tests it.
- [ ] Add basic metrics/uptime visibility (even minimal — container-level monitoring, or a `/metrics` endpoint on the Fastify services) — nothing exists today beyond `/healthz`/`/health` liveness checks.
- [ ] Add alerting on collector/connection outages rather than relying on an Admin visually noticing a red status or an `OutageBanner`.

## P3 — CI/CD & testing

- [ ] Add a CI pipeline (e.g. `.github/workflows/`) running, at minimum: frontend `tsc -b` + `oxlint` + `vite build`, backend `tsc -b` per npm workspace, and `go build ./...` across the collectors Go workspace. None exists today — there is no CI of any kind.
- [ ] Add at least smoke/integration test coverage for the highest-risk paths: the OIDC callback flow, connection CRUD + Postgres/Vault config split, and the `/api/vms` NDJSON streaming path. There are currently zero test files anywhere in the repo (frontend or backend), and no `test` script in any of the 7 `package.json` files.
- [ ] Add a pre-commit hook (`lint-staged`/`husky`) so lint/build issues are caught before commit — no `.husky/` exists today.
- [ ] Add a root `README.md` documenting the actual production deploy steps (env setup from `.env.example`, `docker compose up -d --build`, the external Traefik `proxy` network prerequisite, what to expect from Vault's bootstrap). No such document exists today — only `frontend/README.md`, which only covers local frontend dev.

## P4 — Known feature gaps (carried from `CLAUDE.md`, worth resolving or explicitly accepting before calling this "production ready")

- [ ] GCP and Alibaba Cloud collectors are unverified against a real successful *instance* fetch (both compile and fail gracefully against real credentials; GCP's lightweight `/test` path is confirmed against a real project, but no real Alibaba credential or GCP compute resource has been fetched yet).
- [ ] AWS and Alibaba only cover EC2/ECS compute — e.g. AWS Lightsail VMs are invisible to inventory today. Either fix or explicitly document as a known limitation.

## Roadmap (explicitly not a blocker for this pass)

- [ ] Kubernetes/Helm migration per `PRD.md` §8, if/when the Compose deployment stops scaling for the team's needs.
