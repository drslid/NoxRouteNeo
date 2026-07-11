#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${NOXROUTE_ROOT:-/opt/noxrouteneo}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="noxrouteneo"

log() {
  printf '[noxrouteneo] %s\n' "$*"
}

die() {
  printf '[noxrouteneo] ERREUR: %s\n' "$*" >&2
  exit 1
}

need_root_or_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    die "Lance ce script en root ou installe sudo."
  fi
}

confirm() {
  if [ "${NOXROUTENEO_CONFIRM_UNINSTALL:-}" = "DELETE" ]; then
    return
  fi
  cat <<'EOF'
Cette commande va supprimer la stack applicative locale NoxRouteNeo de ce serveur :

- services Docker Compose du projet noxrouteneo
- configuration générée, secrets, runtime, logs, données et backups dans /opt/noxrouteneo
- image Docker locale noxrouteneo-app, si elle existe

Docker Engine ne sera PAS supprimé.

Définis NOXROUTENEO_CONFIRM_UNINSTALL=DELETE pour continuer.
EOF
  exit 2
}

compose_down() {
  local compose_file env_file
  compose_file="${SRC_DIR}/compose.yaml"
  env_file="${SRC_DIR}/.env"

  if [ -f "${compose_file}" ]; then
    log "Arrêt de la stack Docker Compose..."
    if [ -f "${env_file}" ]; then
      ${SUDO} docker compose --env-file "${env_file}" -f "${compose_file}" down --remove-orphans --rmi local || true
    else
      ${SUDO} docker compose -f "${compose_file}" down --remove-orphans --volumes || true
    fi
  else
    log "Aucun fichier compose trouvé : ${compose_file}."
  fi
}

remove_project_containers() {
  local ids
  ids="$(${SUDO} docker ps -aq --filter "label=com.docker.compose.project=${PROJECT_NAME}" 2>/dev/null || true)"
  if [ -n "${ids}" ]; then
    log "Suppression des conteneurs restants du projet..."
    # shellcheck disable=SC2086
    ${SUDO} docker rm -f ${ids} || true
  fi
}

remove_project_networks() {
  local ids
  ids="$(${SUDO} docker network ls -q --filter "label=com.docker.compose.project=${PROJECT_NAME}" 2>/dev/null || true)"
  if [ -n "${ids}" ]; then
    log "Suppression des réseaux restants du projet..."
    # shellcheck disable=SC2086
    ${SUDO} docker network rm ${ids} || true
  fi
}

remove_images() {
  ${SUDO} docker image rm -f noxrouteneo-web:latest noxrouteneo-runtime:latest \
    noxrouteneo-traffic-gateway:latest 2>/dev/null || true
}

remove_files() {
  if [ -d "${APP_ROOT}" ]; then
    log "Suppression de ${APP_ROOT}..."
    ${SUDO} rm -rf "${APP_ROOT}"
  else
    log "${APP_ROOT} est déjà absent."
  fi
}

doctor() {
  log "Conteneurs NoxRouteNeo restants :"
  ${SUDO} docker ps -a --filter "label=com.docker.compose.project=${PROJECT_NAME}" || true
  log "Ports importants :"
  for port in 80 443 8443; do
    if command -v ss >/dev/null 2>&1 && ss -tuln | awk '{print $5}' | grep -Eq "(:|\\])${port}$"; then
      printf '[noxrouteneo] PORT_%s=occupé\n' "${port}"
    else
      printf '[noxrouteneo] PORT_%s=libre\n' "${port}"
    fi
  done
}

main() {
  need_root_or_sudo
  confirm
  compose_down
  remove_project_containers
  remove_project_networks
  remove_images
  if ${SUDO} swapon --show=NAME --noheadings | grep -Fxq /swapfile.noxrouteneo; then
    ${SUDO} swapoff /swapfile.noxrouteneo || true
  fi
  ${SUDO} sed -i '\#^/swapfile.noxrouteneo #d' /etc/fstab || true
  ${SUDO} rm -f /swapfile.noxrouteneo
  remove_files
  doctor
  log "Désinstallation terminée. Docker Engine reste installé."
}

main "$@"
