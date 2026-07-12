#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${NOXROUTE_REPOSITORY:-https://github.com/drslid/NoxRouteNeo.git}"
REF="${NOXROUTE_REF:-main}"
APP_ROOT="${NOXROUTE_ROOT:-/opt/noxrouteneo}"
SOURCE_DIR="${APP_ROOT}/source"
INSTALL_MARKER="${APP_ROOT}/.install-complete"
INSTALL_MODE="${NOXROUTE_INSTALL_MODE:-image}"
IMAGE_REGISTRY="${NOXROUTE_IMAGE_REGISTRY:-ghcr.io/drslid}"
IMAGE_TAG="${NOXROUTE_IMAGE_TAG:-}"

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

default_image_tag_for_ref() {
  local ref="$1"
  case "${ref}" in
    main) printf 'main' ;;
    v[0-9]*) printf '%s' "${ref#v}" ;;
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*)
      printf 'sha-%s' "${ref:0:7}"
      ;;
    *) return 1 ;;
  esac
}

configure_install_strategy() {
  case "${INSTALL_MODE}" in
    image|source) ;;
    *) die "NOXROUTE_INSTALL_MODE must be 'image' or 'source'." ;;
  esac

  if [ -z "${IMAGE_TAG}" ]; then
    if ! IMAGE_TAG="$(default_image_tag_for_ref "${REF}")"; then
      if [ "${INSTALL_MODE}" = "image" ]; then
        die "No published image tag can be inferred from NOXROUTE_REF='${REF}'. Set NOXROUTE_IMAGE_TAG or use NOXROUTE_INSTALL_MODE=source."
      fi
      IMAGE_TAG="main"
    fi
  fi

  export NOXROUTE_INSTALL_MODE="${INSTALL_MODE}"
  export NOXROUTE_IMAGE_REGISTRY="${IMAGE_REGISTRY}"
  export NOXROUTE_IMAGE_TAG="${IMAGE_TAG}"
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
  local container_ids image_id image_repository
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
  while read -r image_repository image_id; do
    case "${image_repository}" in
      noxrouteneo-*|*/noxrouteneo-*|caddy|postgres)
        docker image rm "${image_id}" >/dev/null 2>&1 || true
        ;;
    esac
  done < <(docker image ls --format '{{.Repository}} {{.ID}}' 2>/dev/null || true)
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
  if [ "${INSTALL_MODE}" = "image" ]; then
    log "Container release: ${IMAGE_REGISTRY}/noxrouteneo-*:${IMAGE_TAG}"
  else
    log "Container release: local source build"
  fi
  if [ "${NOXROUTE_NONINTERACTIVE:-0}" = "1" ]; then
    exec env NOXROUTE_ROOT="${APP_ROOT}" "${installer}"
  fi
  [ -r /dev/tty ] || die "Interactive installation requires a terminal."
  exec env NOXROUTE_ROOT="${APP_ROOT}" "${installer}" </dev/tty
}

main() {
  require_supported_host
  configure_install_strategy
  install_bootstrap_dependencies
  checkout_source
  run_installer
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
