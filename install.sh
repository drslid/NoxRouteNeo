#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${NOXROUTE_REPOSITORY:-https://github.com/drslid/NoxRouteNeo.git}"
REF="${NOXROUTE_REF:-main}"
APP_ROOT="${NOXROUTE_ROOT:-/opt/noxrouteneo}"
SOURCE_DIR="${APP_ROOT}/source"
INSTALL_MARKER="${APP_ROOT}/.install-complete"

log() {
  printf '[noxrouteneo] %s\n' "$*"
}

die() {
  printf '[noxrouteneo] ERROR: %s\n' "$*" >&2
  exit 1
}

require_supported_host() {
  [ "$(id -u)" -eq 0 ] || die "Run this bootstrap with sudo or as root."
  [ -r /etc/os-release ] || die "/etc/os-release was not found."

  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *) die "Unsupported OS '${ID:-unknown}'. Use Ubuntu or Debian." ;;
  esac

  case "$(dpkg --print-architecture 2>/dev/null || true)" in
    amd64|arm64) ;;
    *) die "Only amd64 and arm64 VPS architectures are supported." ;;
  esac
}

install_bootstrap_dependencies() {
  if command -v curl >/dev/null 2>&1 \
    && command -v git >/dev/null 2>&1 \
    && dpkg-query -W -f='${Status}' ca-certificates 2>/dev/null | grep -q 'ok installed'; then
    log "Bootstrap dependencies are already installed."
    return
  fi

  export DEBIAN_FRONTEND=noninteractive
  log "Installing the small bootstrap dependency set."
  apt-get update
  apt-get install -y ca-certificates curl git
}

reset_incomplete_installation() {
  local container_ids
  container_ids="$(docker ps -aq \
    --filter 'label=com.docker.compose.project=noxrouteneo' 2>/dev/null || true)"
  if [ -n "${container_ids}" ]; then
    die "An incomplete installation still has project containers. Preserve its data and run the documented uninstall procedure before retrying."
  fi
  if [ -f "${APP_ROOT}/data/postgres/PG_VERSION" ]; then
    die "An incomplete installation contains a PostgreSQL database. It will not be removed automatically. Back it up and run the documented uninstall procedure."
  fi

  log "A previous installation stopped before completion; removing its empty generated state and resuming."
  if [ -e /swapfile.noxrouteneo ]; then
    swapoff /swapfile.noxrouteneo 2>/dev/null || true
    sed -i '\#^/swapfile.noxrouteneo #d' /etc/fstab
    rm -f /swapfile.noxrouteneo
  fi
  docker image rm noxrouteneo-web:latest noxrouteneo-runtime:latest \
    noxrouteneo-traffic-gateway:latest caddy:2-alpine postgres:16-alpine \
    >/dev/null 2>&1 || true
  docker image prune --force >/dev/null 2>&1 || true
  rm -f "${SOURCE_DIR}/.env"
  rm -rf "${APP_ROOT}/data" "${APP_ROOT}/secrets" "${APP_ROOT}/backups"
}

checkout_source() {
  install -d -m 0755 "${APP_ROOT}"

  if [ -f "${SOURCE_DIR}/.env" ]; then
    [ -x "${SOURCE_DIR}/scripts/doctor.sh" ] \
      || die "The existing installation is incomplete: scripts/doctor.sh is missing."
    if [ -f "${INSTALL_MARKER}" ]; then
      log "An existing NoxRouteNeo installation was found; verifying it without overwriting data."
      exec env NOXROUTE_ROOT="${APP_ROOT}" "${SOURCE_DIR}/scripts/doctor.sh" --strict
    fi
    if env NOXROUTE_ROOT="${APP_ROOT}" "${SOURCE_DIR}/scripts/doctor.sh" --strict; then
      log "The existing installation is healthy; recording its completion marker."
      install -m 0600 /dev/null "${INSTALL_MARKER}"
      exit 0
    fi
    reset_incomplete_installation
  fi

  if [ -d "${SOURCE_DIR}/.git" ]; then
    log "An unfinished source checkout already exists; reusing it."
    git -C "${SOURCE_DIR}" fetch --depth=1 origin "${REF}"
    git -C "${SOURCE_DIR}" checkout --detach --force FETCH_HEAD
    return
  fi

  if [ -e "${SOURCE_DIR}" ]; then
    die "${SOURCE_DIR} already exists and is not a NoxRouteNeo Git checkout."
  fi

  log "Downloading NoxRouteNeo (${REF})."
  git clone --depth=1 --branch "${REF}" "${REPOSITORY}" "${SOURCE_DIR}"
}

run_installer() {
  local installer="${SOURCE_DIR}/scripts/install.sh"
  [ -x "${installer}" ] || die "The downloaded installer is missing or not executable."

  log "Source revision: $(git -C "${SOURCE_DIR}" rev-parse --short HEAD)"
  if [ "${NOXROUTE_NONINTERACTIVE:-0}" = "1" ]; then
    exec env NOXROUTE_ROOT="${APP_ROOT}" "${installer}"
  fi
  [ -r /dev/tty ] || die "Interactive installation requires a terminal."
  exec env NOXROUTE_ROOT="${APP_ROOT}" "${installer}" </dev/tty
}

main() {
  require_supported_host
  install_bootstrap_dependencies
  checkout_source
  run_installer
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
