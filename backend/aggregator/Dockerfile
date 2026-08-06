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
COPY aggregator aggregator
RUN npm run build -w @cirrus/shared-types && npm run build -w @cirrus/aggregator

FROM manifests AS prod-deps
RUN npm ci --omit=dev

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=manifests /app/package.json /app/package-lock.json ./
COPY --from=manifests /app/shared-types/package.json shared-types/package.json
COPY --from=manifests /app/aggregator/package.json aggregator/package.json
COPY --from=build /app/shared-types/dist shared-types/dist
COPY --from=build /app/aggregator/dist aggregator/dist
WORKDIR /app/aggregator
EXPOSE 4002
CMD ["node", "dist/server.js"]
