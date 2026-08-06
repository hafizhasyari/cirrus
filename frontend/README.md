# Cirrus Frontend

React + TypeScript + Vite SPA for the Cirrus Cloud VM Inventory Dashboard. Ported from the `Cirrus.dc.html` design mockup; currently runs on local mock data (no backend/API integration yet).

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run lint      # oxlint
npm run build     # tsc -b && vite build
```

## Docker

```bash
docker build -t cirrus-frontend .
docker run --rm -p 8080:80 cirrus-frontend   # http://localhost:8080
```
