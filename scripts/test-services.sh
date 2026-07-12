#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GO_IMAGE="golang:1.25-alpine@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587"

bash "${ROOT_DIR}/scripts/test-bootstrap.sh"
bash "${ROOT_DIR}/scripts/test-install.sh"

compose_images="$(env \
  POSTGRES_PASSWORD=test \
  BETTER_AUTH_SECRET=abcdefghijklmnopqrstuvwxyz123456 \
  APP_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
  SETUP_TOKEN=test \
  TRAFFIC_GATEWAY_TOKEN=test \
  ADMIN_URL=https://example.duckdns.org:8443 \
  ADMIN_DOMAIN=example.duckdns.org \
  VPN_DOMAIN=example.duckdns.org \
  docker compose -f "${ROOT_DIR}/compose.yaml" config --images)"

for image in web runtime traffic-gateway security-agent; do
  grep -Fxq "ghcr.io/drslid/noxrouteneo-${image}:main" <<<"${compose_images}" \
    || { printf 'Missing default GHCR image for %s.\n' "${image}" >&2; exit 1; }
done

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

docker build \
  -f "${ROOT_DIR}/services/security-agent/Dockerfile" \
  -t noxrouteneo-security-agent:test \
  "${ROOT_DIR}" >/dev/null

docker run --rm \
  -v "${ROOT_DIR}/services/security-agent/test_agent.py:/tests/test_agent.py:ro" \
  noxrouteneo-security-agent:test \
  python -m unittest discover -s /tests -v
