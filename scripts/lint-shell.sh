#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHELLCHECK_IMAGE="koalaman/shellcheck-alpine@sha256:5921d946dac740cbeec2fb1c898747b6105e585130cc7f0602eec9a10f7ddb63"

docker run --rm \
  -v "${ROOT_DIR}:/mnt:ro" \
  -w /mnt \
  "${SHELLCHECK_IMAGE}" \
  shellcheck -x \
  install.sh \
  scripts/doctor.sh \
  scripts/install-prereqs.sh \
  scripts/install.sh \
  scripts/lint-shell.sh \
  scripts/test-bootstrap.sh \
  scripts/test-install.sh \
  scripts/test-services.sh \
  scripts/uninstall.sh
