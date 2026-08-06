# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This repository currently contains only `PRD.md` — there is no implementation yet (no source code, build system, tests, or lint config). Treat this as a pre-development planning stage: work here is about refining the product spec, not writing code, until the user says otherwise.

## PRD.md

`PRD.md` is the single source of truth for this project — **Cirrus**, a Cloud VM Inventory Dashboard. Status: Approved. It is written in Bahasa Indonesia prose with English used for role names, table headers, and UI labels (this mixed convention is intentional — keep it when editing).

Key facts to know before making changes to the PRD or (later) implementing against it:

- **What it is**: an internal, read-only dashboard that aggregates VM inventory across the company's own accounts on 5 cloud providers (AWS, GCP, Alibaba Cloud, OCI, Biznet Gio Cloud) — not a multi-tenant SaaS. Avoid "customer" framing when describing cross-account auth; use "akun cloud yang didaftarkan" / "tim pemilik akun" instead.
- **Current MVP scope (§4)**: inventory list + filter/search + RBAC/SSO only. Cost/billing was deliberately cut from the MVP and moved to §10 Roadmap (with the per-provider cost-API research preserved there so it isn't lost) — don't reintroduce cost UI/flows into MVP sections (§2–§9).
- **Roles (§3)**: exactly 2 — `Admin` (manage users/roles, manage cloud account connections, view all data) and `Viewer` (view inventory for assigned accounts/projects only).
- **Auth**: Microsoft Entra ID (Microsoft 365) via OIDC, single-tenant. Identity key is `oid`+`tid` (never `email`, which is mutable).
- **Architecture (§7)**: microservices, Docker for dev / Kubernetes for prod. Frontend SPA → API Gateway/BFF → Auth Service + RBAC Service → Inventory Aggregator → 5 Provider Collectors (one per cloud, each exposing a uniform `GET /instances`). Redis caches fetch results (TTL 2–5 min, with a cache-stampede lock); PostgreSQL holds app metadata only (never live-pulled VM data).
- **Per-provider credential model (§7.3)** — deliberately different per provider, verified against current docs, don't default back to "just use an API key" for all of them:
  - AWS & Alibaba Cloud: cross-account role assumption (`AssumeRole`) — Cirrus holds one shared "hub" credential per provider in Vault, not a secret per registered account.
  - GCP: Workload Identity Federation — no static secret stored at all.
  - OCI & Biznet Gio Cloud: static per-account credentials (API Signing Key / `x-token`) in Vault KV v2 — confirmed this is still the correct pattern for these two.
- **Tech stack (§8)**: React+TypeScript+Vite frontend; Go (using `errgroup` for collector fan-out) for Provider Collectors; Node.js/TypeScript for BFF/Aggregator/RBAC; PostgreSQL + Redis; HashiCorp Vault (KV v2); Helm umbrella chart (one subchart per microservice) for Kubernetes deploy.

## Working with this PRD

- Always verify technical/API claims (cloud provider API names, auth mechanisms, current best practices) using `mcp__context7__query-docs` and cross-check with `WebSearch` before writing them into the PRD — don't rely on training-data recall alone for this kind of detail. Both tools are pre-approved in `.claude/settings.local.json`.
- When a scope or architecture decision changes, propagate it across *all* affected sections (goals, RBAC table, feature list, user flow, architecture diagram/prose, integration table, metrics, risks) rather than editing just one section — this PRD's sections cross-reference each other by §-number.

## Git conventions

- This repo's git identity (local to this repo only, not global) is `Support InMotion <support@example.com>`.
- Commit messages are in English: a short subject line, followed by a body written as **bullet points** describing the change (not prose paragraphs).
- `.claude/settings.local.json` is gitignored (personal/local tool permissions, not shared repo config).
