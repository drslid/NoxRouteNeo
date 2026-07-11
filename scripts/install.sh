#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${NOXROUTE_ROOT:-/opt/noxrouteneo}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SRC_DIR}/.env"
ADMIN_HTTPS_PORT="${ADMIN_HTTPS_PORT:-8443}"
APP_LOCALE="${APP_LOCALE:-}"
DUCKDNS_DOMAIN="${DUCKDNS_DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

log() {
  printf '[noxrouteneo] %s\n' "$*"
}

die() {
  printf '[noxrouteneo] ERROR: %s\n' "$*" >&2
  exit 1
}

choose_language() {
  if [ -z "${APP_LOCALE}" ] && [ "${NOXROUTE_NONINTERACTIVE:-0}" = "1" ]; then
    APP_LOCALE="en"
  fi

  if [ -z "${APP_LOCALE}" ]; then
    printf '\nNoxRouteNeo - Select the interface language / Choisissez la langue\n\n'
    printf '  1) English\n  2) Español\n  3) Français\n  4) Deutsch\n'
    printf '  5) 简体中文\n  6) العربية\n  7) Русский\n  8) Português\n'
    printf '  9) हिन्दी\n 10) اردو\n\n'
    read -r -p 'Language [1]: ' language_choice
    case "${language_choice:-1}" in
      1) APP_LOCALE="en" ;;
      2) APP_LOCALE="es" ;;
      3) APP_LOCALE="fr" ;;
      4) APP_LOCALE="de" ;;
      5) APP_LOCALE="zh-CN" ;;
      6) APP_LOCALE="ar" ;;
      7) APP_LOCALE="ru" ;;
      8) APP_LOCALE="pt" ;;
      9) APP_LOCALE="hi" ;;
      10) APP_LOCALE="ur" ;;
      *) die "Invalid language selection." ;;
    esac
  fi

  case "${APP_LOCALE}" in
    en|es|fr|de|zh-CN|ar|ru|pt|hi|ur) ;;
    *) die "APP_LOCALE must be one of: en, es, fr, de, zh-CN, ar, ru, pt, hi, ur." ;;
  esac
  export APP_LOCALE
  log "Interface language: ${APP_LOCALE}"
}

prompt_text() {
  local key="$1"
  case "${APP_LOCALE}:${key}" in
    es:domain) printf 'Dominio de DuckDNS' ;;
    es:duckdns_token) printf 'Token de DuckDNS' ;;
    fr:domain) printf 'Domaine DuckDNS' ;;
    fr:duckdns_token) printf 'Token DuckDNS' ;;
    de:domain) printf 'DuckDNS-Domain' ;;
    de:duckdns_token) printf 'DuckDNS-Token' ;;
    zh-CN:domain) printf 'DuckDNS 域名' ;;
    zh-CN:duckdns_token) printf 'DuckDNS 令牌' ;;
    ar:domain) printf 'نطاق DuckDNS' ;;
    ar:duckdns_token) printf 'رمز DuckDNS' ;;
    ru:domain) printf 'Домен DuckDNS' ;;
    ru:duckdns_token) printf 'Токен DuckDNS' ;;
    pt:domain) printf 'Domínio DuckDNS' ;;
    pt:duckdns_token) printf 'Token DuckDNS' ;;
    hi:domain) printf 'DuckDNS डोमेन' ;;
    hi:duckdns_token) printf 'DuckDNS टोकन' ;;
    ur:domain) printf 'DuckDNS ڈومین' ;;
    ur:duckdns_token) printf 'DuckDNS ٹوکن' ;;
    *:domain) printf 'DuckDNS domain' ;;
    *:duckdns_token) printf 'DuckDNS token' ;;
  esac
}

need_privileges() {
  if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    die "Run this installer as root or install sudo."
  fi
}

validate_supported_host() {
  local architecture available_kib minimum_kib
  [ -r /etc/os-release ] || die "/etc/os-release was not found."
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *) die "Unsupported OS '${ID:-unknown}'. Ubuntu and Debian are supported." ;;
  esac

  architecture="$(dpkg --print-architecture 2>/dev/null || true)"
  case "${architecture}" in
    amd64|arm64) ;;
    *) die "Unsupported architecture '${architecture:-unknown}'. Use amd64 or arm64." ;;
  esac

  available_kib="$(df -Pk "${SRC_DIR}" | awk 'NR == 2 {print $4}')"
  minimum_kib=$((7 * 1024 * 1024))
  [ "${available_kib}" -ge "${minimum_kib}" ] \
    || die "At least 7 GB of free disk space is required for the initial build."
}

install_dependencies() {
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    log "Docker is missing. Installing Docker Engine and Compose."
    ${SUDO} bash "${SRC_DIR}/scripts/install-prereqs.sh"
  fi

  local missing=()
  for command in curl jq openssl getent ss; do
    command -v "${command}" >/dev/null 2>&1 || missing+=("${command}")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    log "Installing setup utilities."
    ${SUDO} apt-get update
    ${SUDO} apt-get install -y curl jq openssl libc-bin iproute2
  fi
}

prompt_value() {
  local variable="$1" prompt="$2" secret="${3:-false}" value=""
  if [[ -v "${variable}" ]]; then
    value="${!variable}"
  fi
  if [ -z "${value}" ] && [ "${NOXROUTE_NONINTERACTIVE:-0}" != "1" ]; then
    if [ "${secret}" = "true" ]; then
      read -r -s -p "${prompt}: " value
      printf '\n'
    else
      read -r -p "${prompt}: " value
    fi
  fi
  [ -n "${value}" ] || die "${variable} is required."
  printf -v "${variable}" '%s' "${value}"
  export "${variable?}"
}

normalize_domain() {
  local domain
  domain="$(printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's#^https?://##; s#[:/].*$##')"
  if [[ "${domain}" != *.* ]]; then
    domain="${domain}.duckdns.org"
  fi
  printf '%s' "${domain}"
}

configure_domains() {
  if [ -n "${ADMIN_DOMAIN:-}" ] && [ -n "${VPN_DOMAIN:-}" ]; then
    export ADMIN_DOMAIN VPN_DOMAIN
    return
  fi

  DUCKDNS_DOMAIN="${DUCKDNS_DOMAIN:-${ADMIN_DOMAIN:-${VPN_DOMAIN:-}}}"
  prompt_value DUCKDNS_DOMAIN "$(prompt_text domain)"
  ADMIN_DOMAIN="${DUCKDNS_DOMAIN}"
  VPN_DOMAIN="${DUCKDNS_DOMAIN}"
  export DUCKDNS_DOMAIN ADMIN_DOMAIN VPN_DOMAIN
}

validate_inputs() {
  ADMIN_DOMAIN="$(normalize_domain "${ADMIN_DOMAIN}")"
  VPN_DOMAIN="$(normalize_domain "${VPN_DOMAIN}")"
  export ADMIN_DOMAIN VPN_DOMAIN
  [[ "${ADMIN_DOMAIN}" =~ ^[a-z0-9-]+\.duckdns\.org$ ]] \
    || die "ADMIN_DOMAIN must be a DuckDNS hostname."
  [[ "${VPN_DOMAIN}" =~ ^[a-z0-9-]+\.duckdns\.org$ ]] \
    || die "VPN_DOMAIN must be a DuckDNS hostname."
  [ "${#DUCKDNS_TOKEN}" -ge 20 ] || die "DUCKDNS_TOKEN is too short."
  if [ -n "${LETSENCRYPT_EMAIL}" ]; then
    [[ "${LETSENCRYPT_EMAIL}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] \
      || die "LETSENCRYPT_EMAIL is invalid."
  fi
  [[ "${OWNER_USERNAME}" =~ ^[A-Za-z0-9._-]{3,30}$ ]] \
    || die "OWNER_USERNAME must contain 3-30 safe characters."
  [ "${#OWNER_PASSWORD}" -ge 12 ] || die "OWNER_PASSWORD must contain at least 12 characters."
  if ! [[ "${ADMIN_HTTPS_PORT}" =~ ^[0-9]+$ ]] \
    || [ "${ADMIN_HTTPS_PORT}" -lt 1 ] \
    || [ "${ADMIN_HTTPS_PORT}" -gt 65535 ]; then
    die "ADMIN_HTTPS_PORT is invalid."
  fi
}

ensure_ports_free() {
  local port
  for port in 80 443 "${ADMIN_HTTPS_PORT}"; do
    if ${SUDO} ss -H -lnt "sport = :${port}" | grep -q .; then
      die "TCP port ${port} is already in use. Stop the conflicting service first."
    fi
  done
}

configure_local_firewall() {
  local port
  if ! command -v ufw >/dev/null 2>&1; then
    return
  fi
  if ! ${SUDO} ufw status 2>/dev/null | grep -q '^Status: active'; then
    return
  fi

  log "Allowing NoxRouteNeo ports in the active UFW firewall."
  for port in 80 443 "${ADMIN_HTTPS_PORT}"; do
    ${SUDO} ufw allow "${port}/tcp" >/dev/null
  done
}

ensure_build_memory() {
  local total_kib target_kib swap_mib
  total_kib="$(awk '/MemTotal|SwapTotal/ { total += $2 } END { print total }' /proc/meminfo)"
  target_kib=2359296
  if [ "${total_kib}" -ge "${target_kib}" ]; then
    return
  fi
  swap_mib=$(((target_kib - total_kib + 1023) / 1024))
  if [ ! -f /swapfile.noxrouteneo ]; then
    log "Adding a ${swap_mib} MB build swap file for this small VPS."
    ${SUDO} fallocate -l "${swap_mib}M" /swapfile.noxrouteneo
    ${SUDO} chmod 600 /swapfile.noxrouteneo
    ${SUDO} mkswap /swapfile.noxrouteneo >/dev/null
  fi
  ${SUDO} swapon /swapfile.noxrouteneo 2>/dev/null || true
  if ! grep -q '^/swapfile.noxrouteneo ' /etc/fstab; then
    printf '/swapfile.noxrouteneo none swap sw 0 0\n' | ${SUDO} tee -a /etc/fstab >/dev/null
  fi
}

update_duckdns() {
  local domains response public_ip deadline admin_ready vpn_ready
  domains="${ADMIN_DOMAIN%.duckdns.org}"
  if [ "${VPN_DOMAIN}" != "${ADMIN_DOMAIN}" ]; then
    domains="${domains},${VPN_DOMAIN%.duckdns.org}"
  fi
  public_ip="$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')"
  [ -n "${public_ip}" ] || die "Could not detect the public IPv4 address."
  log "Public IPv4 detected: ${public_ip}"
  response="$(curl -fsS --max-time 20 --get \
    --data-urlencode "domains=${domains}" \
    --data-urlencode "token=${DUCKDNS_TOKEN}" \
    --data-urlencode "ip=${public_ip}" \
    https://www.duckdns.org/update)"
  [ "${response}" = "OK" ] || die "DuckDNS rejected the update."

  log "Waiting for the configured DuckDNS name to resolve to this server."
  deadline=$((SECONDS + 180))
  while [ "${SECONDS}" -lt "${deadline}" ]; do
    admin_ready=0
    vpn_ready=0
    getent ahostsv4 "${ADMIN_DOMAIN}" | awk '{print $1}' | grep -Fxq "${public_ip}" && admin_ready=1
    if [ "${VPN_DOMAIN}" = "${ADMIN_DOMAIN}" ]; then
      vpn_ready="${admin_ready}"
    else
      getent ahostsv4 "${VPN_DOMAIN}" | awk '{print $1}' | grep -Fxq "${public_ip}" && vpn_ready=1
    fi
    if [ "${admin_ready}" -eq 1 ] && [ "${vpn_ready}" -eq 1 ]; then
      log "DuckDNS resolution is ready."
      return
    fi
    sleep 3
  done
  die "DuckDNS did not resolve to ${public_ip} within three minutes."
}

write_environment() {
  local postgres_password auth_secret encryption_key setup_token traffic_gateway_token
  postgres_password="$(openssl rand -hex 32)"
  auth_secret="$(openssl rand -base64 48 | tr -d '\n')"
  encryption_key="$(openssl rand -base64 32 | tr -d '\n')"
  setup_token="$(openssl rand -hex 32)"
  traffic_gateway_token="$(openssl rand -hex 32)"
  SETUP_TOKEN="${setup_token}"
  export SETUP_TOKEN

  ${SUDO} install -d -m 0750 "${APP_ROOT}/data/postgres" \
    "${APP_ROOT}/data/caddy" "${APP_ROOT}/data/caddy-config" \
    "${APP_ROOT}/secrets" "${APP_ROOT}/backups"
  ${SUDO} chown -R 70:70 "${APP_ROOT}/data/postgres"
  ${SUDO} chown -R root:root "${APP_ROOT}/data/caddy" \
    "${APP_ROOT}/data/caddy-config"
  ${SUDO} chmod 0750 "${APP_ROOT}/data/caddy" \
    "${APP_ROOT}/data/caddy-config"

  umask 077
  {
    printf 'NOXROUTE_ROOT=%s\n' "${APP_ROOT}"
    printf 'POSTGRES_DB=noxrouteneo\n'
    printf 'POSTGRES_USER=noxroute\n'
    printf 'POSTGRES_PASSWORD=%s\n' "${postgres_password}"
    printf 'BETTER_AUTH_SECRET=%s\n' "${auth_secret}"
    printf 'APP_ENCRYPTION_KEY=%s\n' "${encryption_key}"
    printf 'SETUP_TOKEN=%s\n' "${setup_token}"
    printf 'TRAFFIC_GATEWAY_TOKEN=%s\n' "${traffic_gateway_token}"
    printf 'TRAFFIC_GATEWAY_MAX_CONNECTIONS=4096\n'
    printf 'TRAFFIC_GATEWAY_MAX_CONNECTION_IDLE=10m\n'
    printf 'TRAFFIC_GATEWAY_MAX_LIMITER_WAIT=1s\n'
    printf 'APP_LOCALE=%s\n' "${APP_LOCALE}"
    printf 'ADMIN_DOMAIN=%s\n' "${ADMIN_DOMAIN}"
    printf 'VPN_DOMAIN=%s\n' "${VPN_DOMAIN}"
    printf 'ADMIN_HTTPS_PORT=%s\n' "${ADMIN_HTTPS_PORT}"
    printf 'ADMIN_URL=https://%s:%s\n' "${ADMIN_DOMAIN}" "${ADMIN_HTTPS_PORT}"
    printf 'LETSENCRYPT_EMAIL=%s\n' "${LETSENCRYPT_EMAIL}"
    printf 'SERVER_BANDWIDTH_MBIT=%s\n' "${SERVER_BANDWIDTH_MBIT:-100}"
  } | ${SUDO} tee "${ENV_FILE}" >/dev/null
  ${SUDO} chmod 600 "${ENV_FILE}"
}

wait_for_url() {
  local url="$1" attempts="${2:-60}" pause="${3:-2}" _
  for _ in $(seq 1 "${attempts}"); do
    curl -fsS --max-time 5 "${url}" >/dev/null 2>&1 && return
    sleep "${pause}"
  done
  return 1
}

wait_for_gateway() {
  local _
  for _ in $(seq 1 60); do
    if ${SUDO} docker compose --env-file "${ENV_FILE}" -f "${SRC_DIR}/compose.yaml" \
      exec -T traffic-gateway /traffic-gateway healthcheck >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done
  return 1
}

start_stack() {
  log "Building and starting the production containers."
  ${SUDO} docker compose --env-file "${ENV_FILE}" -f "${SRC_DIR}/compose.yaml" up -d --build
  wait_for_url http://127.0.0.1:3000/api/health 90 2 \
    || die "The web application did not become healthy."
}

bootstrap_owner() {
  local payload status response_file
  response_file="$(mktemp)"
  payload="$(jq -n \
    --arg ownerUsername "${OWNER_USERNAME}" \
    --arg ownerPassword "${OWNER_PASSWORD}" \
    --arg ownerName "${OWNER_NAME}" \
    --arg appLocale "${APP_LOCALE}" \
    --arg adminDomain "${ADMIN_DOMAIN}" \
    --arg vpnDomain "${VPN_DOMAIN}" \
    --arg duckdnsToken "${DUCKDNS_TOKEN}" \
    --argjson adminHttpsPort "${ADMIN_HTTPS_PORT}" \
    '{appLocale:$appLocale,ownerUsername:$ownerUsername,ownerPassword:$ownerPassword,ownerName:$ownerName,adminDomain:$adminDomain,vpnDomain:$vpnDomain,duckdnsToken:$duckdnsToken,adminHttpsPort:$adminHttpsPort}')"
  status="$(curl -sS -o "${response_file}" -w '%{http_code}' \
    -H "X-Setup-Token: ${SETUP_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data "${payload}" \
    http://127.0.0.1:3000/api/setup/bootstrap)"
  if [ "${status}" != "201" ]; then
    log "Bootstrap response: $(jq -r '.error // "unknown error"' "${response_file}")"
    rm -f "${response_file}"
    die "Initial owner bootstrap failed with HTTP ${status}."
  fi
  rm -f "${response_file}"
}

finish_installation() {
  log "Waiting for the Traffic Gateway, Xray, DuckDNS and the HTTPS administration endpoint."
  wait_for_gateway \
    || die "The Traffic Gateway did not become healthy."
  wait_for_url http://127.0.0.1:18081/health 90 2 \
    || die "The VPN runtime did not become healthy."
  wait_for_url "https://${ADMIN_DOMAIN}:${ADMIN_HTTPS_PORT}/api/health" 120 3 \
    || die "HTTPS did not become reachable. Check ports 80 and ${ADMIN_HTTPS_PORT}."

  if [ "${NOXROUTE_KEEP_BUILD_CACHE:-0}" != "1" ]; then
    log "Removing Docker build cache to recover disk space."
    ${SUDO} docker builder prune --all --force >/dev/null 2>&1 || true
  fi

  log "Running the final local installation verification."
  ${SUDO} env NOXROUTE_ROOT="${APP_ROOT}" "${SRC_DIR}/scripts/doctor.sh" --strict

  printf '\nNoxRouteNeo installation complete.\n'
  printf 'Admin URL: https://%s:%s\n' "${ADMIN_DOMAIN}" "${ADMIN_HTTPS_PORT}"
  printf 'VPN endpoint: %s:443\n' "${VPN_DOMAIN}"
  printf 'Owner username: %s\n' "${OWNER_USERNAME}"
  printf 'Temporary owner password: %s\n' "${OWNER_PASSWORD}"
  printf 'Change this password after the first sign-in.\n'
}

main() {
  need_privileges
  choose_language
  validate_supported_host
  install_dependencies
  configure_domains
  prompt_value DUCKDNS_TOKEN "$(prompt_text duckdns_token)" true
  OWNER_USERNAME="${OWNER_USERNAME:-owner}"
  OWNER_NAME="${OWNER_NAME:-Primary Owner}"
  OWNER_PASSWORD="${OWNER_PASSWORD:-Neo-$(openssl rand -hex 12)!}"
  export OWNER_USERNAME OWNER_NAME OWNER_PASSWORD
  validate_inputs
  ensure_ports_free
  configure_local_firewall
  ensure_build_memory
  update_duckdns
  write_environment
  start_stack
  bootstrap_owner
  finish_installation
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
