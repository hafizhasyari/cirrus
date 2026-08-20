# syntax=docker/dockerfile:1
# Build context is backend/collectors/ so this can see the sibling
# internal-kit module its go.mod `replace` directive points at.

FROM golang:1.26-alpine3.23 AS build
ARG CIRRUS_VERSION=dev
WORKDIR /app
COPY internal-kit internal-kit
COPY aws aws
WORKDIR /app/aws
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w -X cirrus/collectorkit.Version=${CIRRUS_VERSION}" -o /out/collector ./cmd

FROM gcr.io/distroless/static-debian12:nonroot AS run
COPY --from=build /out/collector /collector
# Statically-linked wget from busybox, solely so Docker's HEALTHCHECK (see
# docker-compose.yml) has something to exec — distroless ships no shell/tools.
COPY --from=busybox:1.36-musl /bin/wget /usr/bin/wget
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/collector"]
