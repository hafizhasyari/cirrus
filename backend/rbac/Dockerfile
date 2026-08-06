# syntax=docker/dockerfile:1
FROM node:24-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared-types/package.json shared-types/package.json
COPY bff/package.json bff/package.json
COPY auth/package.json auth/package.json
COPY rbac/package.json rbac/package.json
COPY aggregator/package.json aggregator/package.json

FROM manifests AS build
RUN npm ci
COPY tsconfig.base.json ./
COPY shared-types shared-types
COPY rbac rbac
RUN npm run build -w @cirrus/shared-types && npm run build -w @cirrus/rbac

FROM manifests AS prod-deps
RUN npm ci --omit=dev

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=manifests /app/package.json /app/package-lock.json ./
COPY --from=manifests /app/shared-types/package.json shared-types/package.json
COPY --from=manifests /app/rbac/package.json rbac/package.json
COPY --from=build /app/shared-types/dist shared-types/dist
COPY --from=build /app/rbac/dist rbac/dist
# Raw SQL migration files (not compiled by tsc) — migrate.js reads these by
# relative path at runtime.
COPY --from=build /app/rbac/src/db/migrations rbac/src/db/migrations
WORKDIR /app/rbac
EXPOSE 4001
CMD ["node", "dist/server.js"]
