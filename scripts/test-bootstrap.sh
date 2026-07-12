#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=install.sh
source "${ROOT_DIR}/install.sh"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

[ "$(default_image_tag_for_ref main)" = "main" ] \
  || fail "main did not resolve to the main image tag"
[ "$(default_image_tag_for_ref v1.2.3)" = "1.2.3" ] \
  || fail "release ref did not resolve to its semantic image tag"
[ "$(default_image_tag_for_ref 0123456789abcdef)" = "sha-0123456" ] \
  || fail "commit ref did not resolve to its immutable image tag"
if default_image_tag_for_ref feature/test >/dev/null 2>&1; then
  fail "an unpublished branch inferred an image tag"
fi

INSTALL_MODE=image
IMAGE_REGISTRY=ghcr.io/drslid
IMAGE_TAG=""
REF=main
configure_install_strategy
[ "${NOXROUTE_IMAGE_TAG}" = "main" ] \
  || fail "bootstrap did not export the main image tag"

test_root="$(mktemp -d)"
trap 'rm -rf "${test_root}"' EXIT

APP_ROOT="${test_root}/app"
SOURCE_DIR="${APP_ROOT}/source"

mkdir -p "${SOURCE_DIR}" "${APP_ROOT}/data/postgres" \
  "${APP_ROOT}/secrets" "${APP_ROOT}/backups"
touch "${SOURCE_DIR}/.env" "${APP_ROOT}/data/generated-file"

# shellcheck disable=SC2317
docker() {
  return 0
}

reset_incomplete_installation
[ ! -e "${SOURCE_DIR}/.env" ] || fail "partial environment was not removed"
[ ! -e "${APP_ROOT}/data" ] || fail "empty generated data was not removed"
[ -d "${SOURCE_DIR}" ] || fail "source checkout was removed"

mkdir -p "${APP_ROOT}/data/postgres"
touch "${SOURCE_DIR}/.env" "${APP_ROOT}/data/postgres/PG_VERSION"
if (reset_incomplete_installation >/dev/null 2>&1); then
  fail "initialized PostgreSQL data was removed automatically"
fi
[ -e "${SOURCE_DIR}/.env" ] || fail "database guard changed the environment"

rm -f "${APP_ROOT}/data/postgres/PG_VERSION"
# shellcheck disable=SC2317
docker() {
  printf 'container-id\n'
}
if (reset_incomplete_installation >/dev/null 2>&1); then
  fail "an installation with project containers was reset automatically"
fi
[ -e "${SOURCE_DIR}/.env" ] || fail "container guard changed the environment"

printf 'Bootstrap recovery tests passed.\n'
