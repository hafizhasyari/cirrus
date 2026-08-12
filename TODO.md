# Cirrus — Production Readiness TODO

Checklist to take Cirrus from "works in local Docker Compose" to "safe to run in production." Target deployment is the **existing Docker Compose + Traefik setup** (see `docker-compose.yml` — already has a real domain, `cirrus.example.com`, with Let's Encrypt TLS at the edge). This is a deliberate choice: `PRD.md` §8 names Kubernetes as the long-term target, but Compose+Traefik is what's actually wired up today, so it's the near-term production path — Kubernetes stays on the list below as roadmap, not a blocker.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together and [CLAUDE.md](CLAUDE.md) for the full incident/decision history behind the feature gaps in P4.

## P0 — Blockers (must fix before going live)

- [x] Real Microsoft Entra ID app registration obtained and wired into `.env` (`ENTRA_TENANT_ID`/`ENTRA_CLIENT_ID`/`ENTRA_CLIENT_SECRET`).
- [x] `DEV_LOGIN_ENABLED` now has a second, independent gate: `backend/auth/src/env.ts`'s `devLoginEnabled` also requires `NODE_ENV !== 'production'`, so a stray `DEV_LOGIN_ENABLED=true` left in a production `.env` can't reactivate `/dev-login` once deployed with `docker-compose.prod.yml` (which sets `NODE_ENV=production`). A suppressed-but-requested case now logs a distinct warning in `server.ts`.
- [x] Every insecure baked-in default in `docker-compose.yml` (`INTERNAL_SHARED_SECRET`, `COOKIE_SECRET`, `POSTGRES_PASSWORD`) now uses Compose's `${VAR:?message}` syntax (same pattern `VAULT_TOKEN` already used) — `docker compose up` now refuses to start if any of these are unset, instead of silently falling back to a dev value. `.env.example`'s example values for these were blanked out too, each with a `openssl rand -hex ...` generation hint, so there's nothing left to copy-paste into a real deployment.
- [x] Vault bootstrap fixed: `vault/entrypoint.sh` now writes unseal keys + root token to a dedicated `vault-init` Docker volume (`/vault/init`), separate from `vault-file` (`/vault/file`) where the encrypted secret data lives, and no longer `echo`s the raw `vault operator init` output to container logs on first boot. An already-running deployment self-migrates its existing `vault-file`-resident init file to the new volume on its next restart, no manual steps needed. Still needed as a one-time **manual** operational step: rotate/purge the root token + unseal keys already printed to this environment's *existing* `docker compose logs vault` output from a prior boot — code can't undo that.
- [x] Postgres/Redis/Vault no longer publish their ports to the host when deployed via the new `docker-compose.prod.yml` overlay (`ports: !reset []`) — `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` is now the production invocation. Local dev keeps using the plain `docker compose up -d --build`, unchanged, with those ports still exposed for `psql`/`redis-cli`/`vault` CLI convenience.
- [x] `NODE_ENV=production` is now set for `bff`/`auth`/`rbac`/`aggregator` via `docker-compose.prod.yml`, and all four now register a `setErrorHandler` (`server.ts`) that logs the full error server-side but only ever sends a generic `"Internal Server Error"` message to the client for 5xx — intentional 4xx messages (validation, etc.) still pass through.
- [x] `restart: unless-stopped` added to all 14 services in `docker-compose.yml`.
- [x] Healthchecks added for `bff`, `frontend`, and all 5 collector services. Collectors run on `gcr.io/distroless/static-debian12:nonroot`, which has no shell/tools at all, so each collector Dockerfile now `COPY`s a statically-linked `busybox:1.36-musl` `wget` binary in alongside the app binary purely so Compose's `CMD`-form healthcheck has something to exec (verified: builds and runs fine, no missing-library errors). `aggregator`'s `depends_on` on the 5 collectors and `frontend`'s `depends_on` on `bff` were tightened from `service_started`/implicit to `service_healthy` now that there's a real check to wait on.

## P0.5 — MVP feature gaps (PRD promises not fully delivered)

Found via a direct code audit against `PRD.md` §4–§6 and the frontend's own UI completeness, separate from the infra/ops gaps above. Some of these are the same underlying issue already listed elsewhere (e.g. the health-check job also appears in P2) — kept here too since they're PRD-level functional gaps, not just ops nice-to-haves.

- [x] **Periodic connection health-check job (PRD §6.1/§7.3) — built.** `backend/rbac/src/scheduler.ts` runs an in-process `setInterval` (`HEALTH_CHECK_INTERVAL_SECONDS`, default 21600s/6h, 0 disables it) that re-checks every stored connection (all providers, all statuses) in batches of 5 via `Promise.allSettled`. The manual `POST /connections/:id/test` route's update+audit logic was extracted into `backend/rbac/src/lib/connectionCheck.ts`'s `runConnectionCheck()` so both paths share one code path; a new `metadata.source: 'manual' | 'scheduled'` field on the `connection_test` audit action distinguishes the two (no new "system actor" — `actorUserId: null` was already a supported value). Single-`rbac`-instance assumption, no jitter needed today. (Same item as P2's health-check bullet below.)
- [x] **Inventory filters — account/region added.** PRD §4.1.2/§5.3 promise filter by provider, account/project, region, and status. `useCirrusApp.ts` now has `filterAccounts`/`filterRegions` (and `InventoryScreen.tsx` two more `FilterDropdown`s) alongside the existing provider/status/search. Unlike provider/status (a fixed universe, seeded to "all"), account/region have no fixed universe — the option list is derived live from distinct `Vm.account`/`Vm.region` values as VMs stream in — so these two use `[] = unrestricted` semantics instead of a pre-seeded full list, so a newly-streamed-in account/region isn't incorrectly treated as filtered out.
- [ ] **Users screen has no empty state**: `UsersScreen.tsx` renders a bare table with no rows/message when `app.users` is empty, unlike Inventory/Connections which both have a real `EmptyState`.
- [ ] **No real "fetch failed" state on any screen**: Inventory/Connections/Users all only ever show a toast (gone after ~3.2s) on a load failure; once it fades the screen looks identical to "genuinely empty" (e.g. Connections still shows its "Add Connection" empty-state CTA after a failed fetch, not an error state).
- [ ] **No client-side form validation anywhere**: the invite-user form (`UserDrawer.tsx`), the add-connection wizard (`WizardScreen.tsx`), and the edit-connection drawer (`EditConnectionDrawer.tsx`) all submit unconditionally on click with no required-field/email-format checks — every validation failure is a generic backend-rejection toast, no field-level feedback.
- [ ] **iOS Safari safe-area fix applied to only one of four drawers**: commit `d4ca68f` fixed the Sidebar's off-canvas drawer to clear the home-indicator bar (`viewport-fit=cover` + `env(safe-area-inset-bottom)`), but `UserDrawer.tsx`, `EditConnectionDrawer.tsx`, and `VmDetailDrawer.tsx` share the same `.drawer-panel` CSS without that fix — their bottom action rows (Save/Remove) are likely to sit under the home-indicator on notched iPhones too.
- [ ] **No loading state for Connections/Users**: both are populated via a bare `.then(setX)` with no `isLoading` flag, unlike Inventory's `showSkeleton` — first load can flash an empty/blank state before data arrives.

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

- [x] Build the periodic connection health-check job that PRD §6.1 calls for (recommended every 6h) — see the P0.5 bullet above for what shipped.
- [ ] Add basic metrics/uptime visibility (even minimal — container-level monitoring, or a `/metrics` endpoint on the Fastify services) — nothing exists today beyond `/healthz`/`/health` liveness checks.
- [ ] Add alerting on collector/connection outages rather than relying on an Admin visually noticing a red status or an `OutageBanner`.

## P3 — CI/CD & testing

- [ ] Add a CI pipeline (e.g. `.github/workflows/`) running, at minimum: frontend `tsc -b` + `oxlint` + `vite build`, backend `tsc -b` per npm workspace, and `go build ./...` across the collectors Go workspace. None exists today — there is no CI of any kind.
- [ ] Add at least smoke/integration test coverage for the highest-risk paths: the OIDC callback flow, connection CRUD + Postgres/Vault config split, and the `/api/vms` NDJSON streaming path. There are currently zero test files anywhere in the repo (frontend or backend), and no `test` script in any of the 7 `package.json` files.
- [ ] Add a pre-commit hook (`lint-staged`/`husky`) so lint/build issues are caught before commit — no `.husky/` exists today.
- [ ] Add a root `README.md` documenting the actual production deploy steps (env setup from `.env.example`, `docker compose up -d --build`, the external Traefik `proxy` network prerequisite, what to expect from Vault's bootstrap). No such document exists today — only `frontend/README.md`, which only covers local frontend dev.

## P4 — Known feature gaps (carried from `CLAUDE.md`, worth resolving or explicitly accepting before calling this "production ready")

- [x] **GCP and Alibaba Cloud collectors are now confirmed against a real successful instance fetch** — a real GCP project (Compute Engine via WIF) and a real Alibaba Cloud RAM User AccessKey (ECS) both returned real instance data on the first attempt, no code changes needed (see `CLAUDE.md`'s Backend section).
- [ ] AWS and Alibaba only cover EC2/ECS compute — e.g. AWS Lightsail VMs are invisible to inventory today. Either fix or explicitly document as a known limitation.

## Roadmap (explicitly not a blocker for this pass)

- [ ] Kubernetes/Helm migration per `PRD.md` §8, if/when the Compose deployment stops scaling for the team's needs.
