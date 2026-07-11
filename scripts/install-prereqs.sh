#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${NOXROUTE_ROOT:-/opt/noxrouteneo}"
APP_USER="${SUDO_USER:-${USER}}"

log() {
  printf '[noxrouteneo] %s\n' "$*"
}

die() {
  printf '[noxrouteneo] ERROR: %s\n' "$*" >&2
  exit 1
}

need_root_or_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    die "Run this script as root or install sudo."
  fi
}

load_os() {
  [ -r /etc/os-release ] || die "/etc/os-release was not found."
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID}" in
    ubuntu|debian) ;;
    *) die "Unsupported OS '${ID}'. Ubuntu and Debian are supported." ;;
  esac
  OS_ID="${ID}"
  OS_CODENAME="${VERSION_CODENAME:-}"
  [ -n "${OS_CODENAME}" ] || die "VERSION_CODENAME is missing from /etc/os-release."
}

install_docker_repo() {
  local arch repo_url keyring list_file
  arch="$(dpkg --print-architecture)"
  repo_url="https://download.docker.com/linux/${OS_ID}"
  keyring="/etc/apt/keyrings/docker.gpg"
  list_file="/etc/apt/sources.list.d/docker.list"

  log "Installing APT prerequisites."
  export DEBIAN_FRONTEND=noninteractive
  ${SUDO} apt-get update
  ${SUDO} apt-get install -y ca-certificates curl gnupg lsb-release
  ${SUDO} install -m 0755 -d /etc/apt/keyrings

  if [ ! -f "${keyring}" ]; then
    log "Adding the Docker GPG key."
    curl -fsSL "${repo_url}/gpg" | ${SUDO} gpg --dearmor -o "${keyring}"
    ${SUDO} chmod a+r "${keyring}"
  else
    log "The Docker GPG key already exists."
  fi

  log "Configuring the Docker APT repository for ${OS_ID} ${OS_CODENAME} (${arch})."
  printf 'deb [arch=%s signed-by=%s] %s %s stable\n' "${arch}" "${keyring}" "${repo_url}" "${OS_CODENAME}" | ${SUDO} tee "${list_file}" >/dev/null
}

install_docker() {
  log "Installing Docker Engine and the Compose plugin."
  export DEBIAN_FRONTEND=noninteractive
  ${SUDO} apt-get update
  ${SUDO} apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ${SUDO} systemctl enable --now docker

}

create_app_dirs() {
  local dirs
  log "Creating the ${APP_ROOT} structure."
  ${SUDO} install -d -m 0755 -o root -g root "${APP_ROOT}"
  for dirs in data backups; do
    ${SUDO} install -d -m 0750 -o "${APP_USER}" -g "${APP_USER}" "${APP_ROOT}/${dirs}"
  done
  ${SUDO} install -d -m 0700 -o "${APP_USER}" -g "${APP_USER}" "${APP_ROOT}/secrets"
  for dirs in postgres caddy caddy-config; do
    ${SUDO} install -d -m 0750 -o "${APP_USER}" -g "${APP_USER}" "${APP_ROOT}/data/${dirs}"
  done
}

doctor() {
  log "Checking Docker."
  ${SUDO} docker --version
  ${SUDO} docker compose version
  ${SUDO} docker info --format 'Docker server: {{.ServerVersion}} / {{.Architecture}} / {{.OSType}}'

  log "Checking required local ports."
  for port in 80 443 8443; do
    if command -v ss >/dev/null 2>&1 && ss -tuln | awk '{print $5}' | grep -Eq "(:|\\])${port}$"; then
      printf '[noxrouteneo] PORT_%s=in_use\n' "${port}"
    else
      printf '[noxrouteneo] PORT_%s=free\n' "${port}"
    fi
  done

  log "Checking disk and memory."
  df -h / "${APP_ROOT}" 2>/dev/null || df -h /
  free -h || true
}

main() {
  need_root_or_sudo
  load_os
  log "Detected OS: ${PRETTY_NAME:-${OS_ID}} (${OS_CODENAME})."
  install_docker_repo
  install_docker
  create_app_dirs
  doctor
  log "Prerequisites installed. Returning to the main installer."
}

main "$@"
