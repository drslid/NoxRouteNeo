FROM python:3.12-alpine@sha256:6d43704baacd1bfbe7c295d7f13079d5d8104ed33568873133f8fc69980419df

LABEL org.opencontainers.image.source="https://github.com/drslid/NoxRouteNeo" \
  org.opencontainers.image.description="NoxRouteNeo host firewall security agent" \
  org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache nftables

WORKDIR /app
COPY services/security-agent/agent.py /app/agent.py

RUN mkdir -p /security

ENV SECURITY_POLICY_PATH=/security/policy.json
ENV SECURITY_STATUS_PATH=/security/status.json

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD python /app/agent.py healthcheck

CMD ["python", "/app/agent.py"]
