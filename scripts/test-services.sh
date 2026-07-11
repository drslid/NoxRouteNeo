#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GO_IMAGE="golang:1.25-alpine@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587"

bash "${ROOT_DIR}/scripts/test-install.sh"

docker run --rm \
  --ulimit nofile=65536:65536 \
  -v "${ROOT_DIR}/services/traffic-gateway:/src" \
  -w /src \
  "${GO_IMAGE}" \
  go test -count=1 ./...

docker build \
  -f "${ROOT_DIR}/services/runtime/Dockerfile" \
  -t noxrouteneo-runtime:test \
  "${ROOT_DIR}" >/dev/null

docker run --rm \
  -e DATABASE_URL=postgresql://unused \
  -e APP_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
  -e TRAFFIC_GATEWAY_TOKEN=01234567890123456789012345678901 \
  -v "${ROOT_DIR}/services/runtime/test_runtime.py:/tests/test_runtime.py:ro" \
  noxrouteneo-runtime:test \
  python -m unittest discover -s /tests -v
