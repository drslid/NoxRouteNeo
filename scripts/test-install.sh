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

if disk_error="$(validate_available_disk 1048576 image 2>&1)"; then
  printf 'FAIL: image installation accepted less than 2 GiB free disk\n' >&2
  exit 1
fi
case "${disk_error}" in
  *"1024 MiB is available"*) ;;
  *)
    printf 'FAIL: low-disk error does not report detected free space\n' >&2
    exit 1
    ;;
esac

validate_available_disk 2097152 image

if disk_error="$(validate_available_disk 3145728 source 2>&1)"; then
  printf 'FAIL: source installation accepted less than 4 GiB free disk\n' >&2
  exit 1
fi
case "${disk_error}" in
  *"3072 MiB is available"*) ;;
  *)
    printf 'FAIL: source-build disk error does not report detected free space\n' >&2
    exit 1
    ;;
esac

validate_available_disk 4194304 source

INSTALL_MODE=image
IMAGE_REGISTRY=ghcr.io/drslid
IMAGE_TAG=main
validate_install_strategy
assert_equal "image" "${NOXROUTE_INSTALL_MODE}" "image install mode"
assert_equal "ghcr.io/drslid" "${NOXROUTE_IMAGE_REGISTRY}" "image registry"
assert_equal "main" "${NOXROUTE_IMAGE_TAG}" "image tag"

if (INSTALL_MODE=automatic; validate_install_strategy >/dev/null 2>&1); then
  printf 'FAIL: invalid installation mode was accepted\n' >&2
  exit 1
fi

printf 'Installer tests passed.\n'
