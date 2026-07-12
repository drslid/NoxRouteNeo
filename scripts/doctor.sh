#!/usr/bin/env bash
set -uo pipefail

APP_ROOT="${NOXROUTE_ROOT:-/opt/noxrouteneo}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SRC_DIR}/.env"
STRICT=0
FAILURES=0

if [ "${1:-}" = "--strict" ]; then
  STRICT=1
elif [ "${1:-}" != "" ]; then
  printf 'Usage: %s [--strict]\n' "$0" >&2
  exit 2
fi

DOCKER=(docker)

pass() {
  printf '[noxrouteneo] PASS: %s\n' "$*"
}

warn() {
  printf '[noxrouteneo] WARN: %s\n' "$*"
}

fail() {
  printf '[noxrouteneo] FAIL: %s\n' "$*" >&2
  FAILURES=$((FAILURES + 1))
}

read_setting() {
  local key="$1" fallback="${2:-}" value
  value="$(sed -n "s/^${key}=//p" "${ENV_FILE}" 2>/dev/null | tail -n 1)"
  printf '%s' "${value:-${fallback}}"
}

compose() {
  "${DOCKER[@]}" compose --env-file "${ENV_FILE}" -f "${SRC_DIR}/compose.yaml" "$@"
}

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$1 is installed"
  else
    fail "$1 is missing"
  fi
}

check_listener() {
  local port="$1"
  if ss -H -lnt "sport = :${port}" 2>/dev/null | grep -q .; then
    pass "TCP ${port} is listening"
  else
    fail "TCP ${port} is not listening"
  fi
}

check_url() {
  local label="$1" url="$2"
  if curl -fsS --max-time 10 "${url}" >/dev/null 2>&1; then
    pass "${label} is reachable"
  else
    fail "${label} is not reachable (${url})"
  fi
}

check_dns() {
  local domain="$1" public_ip="$2"
  if getent ahostsv4 "${domain}" 2>/dev/null | awk '{print $1}' | grep -Fxq "${public_ip}"; then
    pass "${domain} resolves to ${public_ip}"
  else
    fail "${domain} does not resolve to ${public_ip}"
  fi
}

check_service() {
  local service="$1"
  if compose ps --status running --services 2>/dev/null | grep -Fxq "${service}"; then
    pass "Docker service ${service} is running"
  else
    fail "Docker service ${service} is not running"
  fi
}

main() {
  local admin_domain vpn_domain admin_port public_ip env_mode service

  printf 'NoxRouteNeo local verification\n\n'
  check_command curl
  check_command getent
  check_command ss
  check_command docker

  if ! command -v docker >/dev/null 2>&1; then
    fail "Docker checks cannot continue"
  elif "${DOCKER[@]}" info >/dev/null 2>&1; then
    pass "Docker Engine is running"
  else
    fail "Docker Engine is unavailable; run this command with sudo"
  fi

  if command -v docker >/dev/null 2>&1 && "${DOCKER[@]}" compose version >/dev/null 2>&1; then
    pass "Docker Compose is installed"
  else
    fail "Docker Compose is unavailable"
  fi

  if [ -d "${APP_ROOT}" ]; then
    pass "Application root exists (${APP_ROOT})"
  else
    fail "Application root is missing (${APP_ROOT})"
  fi

  if [ -r "${ENV_FILE}" ]; then
    pass "Generated configuration is readable"
    env_mode="$(stat -c '%a' "${ENV_FILE}" 2>/dev/null || true)"
    if [ "${env_mode}" = "600" ]; then
      pass "Generated configuration permissions are 0600"
    else
      fail "Generated configuration permissions are ${env_mode:-unknown}, expected 0600"
    fi
  else
    fail "Generated configuration is missing (${ENV_FILE})"
    if [ "${STRICT}" -eq 1 ]; then
      exit 1
    fi
    return
  fi

  admin_domain="$(read_setting ADMIN_DOMAIN)"
  vpn_domain="$(read_setting VPN_DOMAIN "${admin_domain}")"
  admin_port="$(read_setting ADMIN_HTTPS_PORT 8443)"
  public_ip="$(curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)"

  if [ -n "${public_ip}" ]; then
    pass "Public IPv4 detected (${public_ip})"
  else
    fail "Public IPv4 could not be detected"
  fi

  check_listener 80
  check_listener 443
  check_listener "${admin_port}"

  if [ -n "${public_ip}" ] && [ -n "${admin_domain}" ]; then
    check_dns "${admin_domain}" "${public_ip}"
  else
    fail "Admin domain is not configured"
  fi
  if [ -n "${public_ip}" ] && [ -n "${vpn_domain}" ] && [ "${vpn_domain}" != "${admin_domain}" ]; then
    check_dns "${vpn_domain}" "${public_ip}"
  fi

  for service in db web caddy traffic-gateway security-agent runtime; do
    check_service "${service}"
  done

  check_url "Local web health" "http://127.0.0.1:3000/api/health"
  check_url "Local VPN runtime health" "http://127.0.0.1:18081/health"
  if [ -n "${admin_domain}" ]; then
    check_url "Public HTTPS portal" "https://${admin_domain}:${admin_port}/api/health"
  fi

  if compose exec -T traffic-gateway /traffic-gateway healthcheck >/dev/null 2>&1; then
    pass "Traffic Gateway is ready"
  else
    fail "Traffic Gateway is unavailable"
  fi

  if compose exec -T db pg_isready \
    -U "$(read_setting POSTGRES_USER noxroute)" \
    -d "$(read_setting POSTGRES_DB noxrouteneo)" >/dev/null 2>&1; then
    pass "PostgreSQL is ready"
  else
    fail "PostgreSQL is unavailable"
  fi

  df -h / "${APP_ROOT}" 2>/dev/null || true
  free -h 2>/dev/null || true

  printf '\n'
  if [ "${FAILURES}" -eq 0 ]; then
    pass "All local installation checks passed"
    return
  fi

  warn "${FAILURES} installation check(s) failed"
  if [ "${STRICT}" -eq 1 ]; then
    exit 1
  fi
}

main
