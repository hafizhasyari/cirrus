# Cirrus Frontend

React + TypeScript + Vite SPA for the Cirrus Cloud VM Inventory Dashboard. Ported from the `Cirrus.dc.html` design mockup; fully wired to the real backend via `src/api/client.ts` — no mock data. See the [root README](../README.md) for full-stack setup (this app talks to `bff`, `auth`, `rbac`, and `aggregator`, run via the root `docker-compose.yml`).

## Develop

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api and /auth to bff
npm run lint      # oxlint
npm run build     # tsc -b && vite build
```

Don't run this alongside the Dockerized `frontend` service — both use port 5173.

## Docker

```bash
docker build -t cirrus-frontend .
docker run --rm -p 8080:80 cirrus-frontend   # http://localhost:8080
```
