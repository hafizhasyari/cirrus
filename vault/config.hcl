ui = true
api_addr = "http://vault:8200"
disable_mlock = true
# RBAC's token is minted with a fixed ~10y TTL and no renewal job (see
# vault/entrypoint.sh) — raise the system default max (768h/32d) so that
# request isn't silently capped.
max_lease_ttl = "87600h"

storage "file" {
  path = "/vault/file"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}
