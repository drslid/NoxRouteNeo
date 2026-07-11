#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=install.sh
source "${ROOT_DIR}/scripts/install.sh"

assert_equal() {
  local expected="$1" actual="$2" label="$3"
  if [ "${expected}" != "${actual}" ]; then
    printf 'FAIL: %s (expected %s, got %s)\n' \
      "${label}" "${expected}" "${actual}" >&2
    exit 1
  fi
}

assert_equal "example.duckdns.org" "$(normalize_domain example)" \
  "short DuckDNS name normalization"
assert_equal "example.duckdns.org" \
  "$(normalize_domain 'https://EXAMPLE.duckdns.org:8443/path')" \
  "full DuckDNS URL normalization"

export NOXROUTE_NONINTERACTIVE=1
export DUCKDNS_DOMAIN="single-name"
unset ADMIN_DOMAIN VPN_DOMAIN
configure_domains
assert_equal "single-name" "${ADMIN_DOMAIN}" "single admin input"
assert_equal "single-name" "${VPN_DOMAIN}" "single VPN input"

export ADMIN_DOMAIN="admin-name.duckdns.org"
export VPN_DOMAIN="vpn-name.duckdns.org"
export DUCKDNS_DOMAIN=""
configure_domains
assert_equal "admin-name.duckdns.org" "${ADMIN_DOMAIN}" "advanced admin domain"
assert_equal "vpn-name.duckdns.org" "${VPN_DOMAIN}" "advanced VPN domain"

export ADMIN_DOMAIN="shared"
export VPN_DOMAIN="shared"
export DUCKDNS_TOKEN="01234567890123456789"
export LETSENCRYPT_EMAIL=""
export OWNER_USERNAME="owner"
export OWNER_PASSWORD="Long-Random-Password-2026!"
export ADMIN_HTTPS_PORT=8443
validate_inputs
assert_equal "shared.duckdns.org" "${ADMIN_DOMAIN}" "validated shared admin domain"
assert_equal "shared.duckdns.org" "${VPN_DOMAIN}" "validated shared VPN domain"

printf 'Installer tests passed.\n'
