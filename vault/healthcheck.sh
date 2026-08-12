#!/bin/sh
# Only report healthy once entrypoint.sh's full bootstrap (init, unseal, KV
# mount, policy, RBAC token) has finished — plain `vault status` alone would
# report healthy the instant the server unseals, racing rbac's
# `depends_on: vault: condition: service_healthy`.
[ -f /vault/init/.cirrus-init/bootstrapped ] && vault status >/dev/null 2>&1
