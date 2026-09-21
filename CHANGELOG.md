# Changelog

All notable changes to Cirrus are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versioning follows
the lockstep scheme described in `CLAUDE.md`'s "Versioning" section.

## [1.0.4] - 2026-09-21

### Security
- Provider Collectors (all 5) now require the shared internal secret on
  every request. Previously, any caller reachable on the internal Docker
  network could fetch a connection's full VM inventory with no credentials
  at all, bypassing the BFF's session check and RBAC's per-user connection
  scoping entirely — found via a full internal penetration test of this
  deployment.
- RBAC's internal connection-config endpoint (the one that returns a
  connection's Vault-backed secret to its collector) now also verifies the
  calling collector's own identity, not just the shared secret — a
  compromised collector can no longer read another provider's credentials
  through it.
- Added a double-submit CSRF cookie on top of the existing SameSite cookie
  + CORS origin allowlist.
- Added rate limiting to RBAC, the Aggregator, and all 5 Go collectors —
  previously only the BFF and Auth Service had any.

### Fixed
- RBAC and the Auth Service now return a proper `400` with a clear
  per-field message for invalid input, instead of a generic `500`.

### Changed
- Pinned the frontend's `phantom-ui` dependency to an exact version and
  patched an unrelated `nanoid` advisory.

## [1.0.3] - 2026-09-01

### Added
- `aggregator` load-test tool (`npm run loadtest -w aggregator`) validating
  PRD §9's performance targets against a synthetic 500-VM/5-provider fleet
  using disposable testcontainers + fake collectors — no live stack needed.
- Pre-commit hook (husky + lint-staged) running oxlint and a typecheck
  against staged frontend files before every commit.

### Fixed
- VM Detail drawer's id (e.g. a long OCI OCID) no longer gets clipped —
  it now wraps across multiple lines like the Inventory table already does.

## [1.0.2] - 2026-08-22

### Fixed
- Inventory's refresh progress indicator ("Refreshing X/Y connections…") now
  counts only the connections a Viewer is actually assigned to, instead of
  every connection in the system.
- Inventory's "Providers connected" stat card now reflects a Viewer's own
  assigned connections instead of always showing 0.
- A Viewer no longer sees outage banners (e.g. "X not responding") for cloud
  providers they have no connection to.

## [1.0.1] - 2026-08-21

### Added
- GitHub Actions workflow (`publish-images.yml`) that builds and publishes
  all 10 first-party service images to GHCR on a `vX.Y.Z` tag push or
  manual dispatch.

### Changed
- Traefik's routing hostname and the Let's Encrypt wildcard cert domain are
  now driven by env vars (`TRAEFIK_HOSTNAME`/`TRAEFIK_CERT_DOMAIN`) instead
  of a hardcoded real domain.
- Resend's sender-email fallback is now a generic example address instead
  of a hardcoded real one.

### Security
- Redacted sensitive detail ahead of making the repository public: a real
  production IP address, a literal exploit-shaped dev-login URL example,
  and the maintainer's personal email.
- Republished the 1.0.0 service images — two of the redacted strings
  (Resend/seed-admin defaults, an invite-email placeholder) had already
  been baked into their compiled output.

## [1.0.0] - 2026-08-20

Initial release — the full MVP per `PRD.md`.

### Added
- Core microservices architecture on Docker Compose: API Gateway/BFF, Auth
  Service, RBAC Service, Inventory Aggregator, and 5 independent Go
  Provider Collectors, backed by PostgreSQL, Redis, and HashiCorp Vault
  (KV v2, production mode).
- Real Microsoft Entra ID OIDC login (single-tenant), with Admin/Viewer
  RBAC and per-Viewer assignment of specific cloud connections.
- Real provider integrations for all 5 clouds: AWS (EC2 + Lightsail), GCP
  (Compute Engine via Workload Identity Federation), Alibaba Cloud (ECS),
  OCI (Core Compute with multi-region/multi-compartment auto-discovery),
  and Biznet Gio Cloud (NEO Lite/NEO Lite Pro).
- React + TypeScript + Vite frontend with real URL routing, streaming
  (NDJSON) Inventory load/refresh, account/region/provider filters, column
  sorting, a responsive layout, and light/dark theme.
- Manual ("Test Connection") and scheduled (every 6h) connection
  health-checks, per-provider setup guides, Resend-based user-invite
  emails, and admin safeguards against self-removal or removing/demoting
  the last remaining admin.
- Production hardening: CORS policy, rate limiting, security headers
  (helmet + nginx CSP), log redaction, cross-service request tracing,
  per-service resource limits, log rotation, Postgres/Vault backup jobs,
  Prometheus metrics, and Telegram outage alerting.
- Lockstep semantic versioning across all 10 first-party services.
