FROM ghcr.io/xtls/xray-core:26.6.27@sha256:c98160906f3fe1d9d16e950c2a7997dc0c542c71816aa92c21e510412f90e1a2 AS xray

FROM python:3.12-alpine@sha256:6d43704baacd1bfbe7c295d7f13079d5d8104ed33568873133f8fc69980419df

LABEL org.opencontainers.image.source="https://github.com/drslid/NoxRouteNeo" \
  org.opencontainers.image.description="NoxRouteNeo Xray runtime and control plane agent" \
  org.opencontainers.image.licenses="MIT"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apk add --no-cache ca-certificates libstdc++ \
  && addgroup -S -g 10001 noxroute \
  && adduser -S -D -H -u 10001 -G noxroute noxroute

COPY --from=xray /usr/local/bin/xray /usr/local/bin/xray
COPY services/runtime/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --requirement /tmp/requirements.txt \
  && rm /tmp/requirements.txt

WORKDIR /app
COPY services/runtime/runtime.py /app/runtime.py

RUN mkdir -p /runtime \
  && chown -R noxroute:noxroute /app /runtime

USER noxroute

EXPOSE 8081 10443

HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8081/health', timeout=2).read()"

CMD ["python", "/app/runtime.py"]
