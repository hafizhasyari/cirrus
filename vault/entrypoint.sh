#!/bin/sh
# Bootstraps Vault in production (non-dev) mode on every container start:
# starts the server, initializes it once (persisting unseal keys + root
# token into the same file-storage volume Vault itself writes to, so both
# live or die together), unseals it, and ensures the KV v2 mount + the
# least-privilege policy/token RBAC uses all exist. Idempotent — safe to
# run on every `docker compose up`/restart, not just the first.
#
# NOTE: never export a shell variable literally named VAULT_TOKEN until
# $ROOT_TOKEN is known — the vault CLI auto-authenticates with that env var
# on every call, so setting it too early (e.g. to the not-yet-created RBAC
# token id) would make every bootstrap command below fail with permission
# denied. The RBAC token id is passed in as $CIRRUS_RBAC_TOKEN instead.

: "${VAULT_ADDR:=http://127.0.0.1:8200}"
export VAULT_ADDR

CONFIG=/vault/config/config.hcl
INIT_DIR=/vault/file/.cirrus-init
INIT_FILE="$INIT_DIR/init.txt"
BOOTSTRAP_FILE="$INIT_DIR/bootstrapped"

vault server -config="$CONFIG" &
VAULT_PID=$!

echo "entrypoint: waiting for vault server to accept connections..."
i=0
while true; do
  OUT=$(vault status 2>&1) && break
  case "$OUT" in
    *"connection refused"*) ;;
    *) break ;;
  esac
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "entrypoint: vault server did not become reachable in time" >&2
    exit 1
  fi
  sleep 1
done

if [ ! -f "$INIT_FILE" ]; then
  echo "entrypoint: first boot — initializing vault (5 key shares, threshold 3)"
  mkdir -p "$INIT_DIR"
  INIT_OUTPUT=$(vault operator init -key-shares=5 -key-threshold=3)
  echo "$INIT_OUTPUT"
  echo "entrypoint: ^ SAVE THE ABOVE UNSEAL KEYS + ROOT TOKEN NOW (e.g. to a password manager) — this is the only time they print to logs."
  printf '%s\n' "$INIT_OUTPUT" >"$INIT_FILE"
  chmod 600 "$INIT_FILE"
fi

UNSEAL_KEYS=$(grep -E '^Unseal Key [0-9]+:' "$INIT_FILE" | awk '{print $NF}')
ROOT_TOKEN=$(grep -E '^Initial Root Token:' "$INIT_FILE" | awk '{print $NF}')

if vault status 2>&1 | grep -qE '^Sealed[[:space:]]+true'; then
  echo "entrypoint: unsealing..."
  n=0
  for key in $UNSEAL_KEYS; do
    n=$((n + 1))
    [ "$n" -gt 3 ] && break
    vault operator unseal "$key" >/dev/null
  done
fi

export VAULT_TOKEN="$ROOT_TOKEN"

if ! vault secrets list 2>/dev/null | grep -qE '^secret/[[:space:]]'; then
  echo "entrypoint: enabling kv-v2 secrets engine at secret/"
  vault secrets enable -path=secret kv-v2
fi

echo "entrypoint: writing cirrus-rbac policy"
vault policy write cirrus-rbac - <<'EOF'
path "secret/data/cirrus/connections/*" {
  capabilities = ["create", "read", "update", "delete"]
}
path "secret/metadata/cirrus/connections/*" {
  capabilities = ["delete"]
}
EOF

if [ -n "$CIRRUS_RBAC_TOKEN" ] && ! vault token lookup "$CIRRUS_RBAC_TOKEN" >/dev/null 2>&1; then
  echo "entrypoint: creating scoped token for RBAC"
  vault token create -id="$CIRRUS_RBAC_TOKEN" -orphan -policy=cirrus-rbac -no-default-policy -ttl=87600h >/dev/null
fi

unset VAULT_TOKEN

mkdir -p "$INIT_DIR"
touch "$BOOTSTRAP_FILE"
echo "entrypoint: bootstrap complete"

wait "$VAULT_PID"
