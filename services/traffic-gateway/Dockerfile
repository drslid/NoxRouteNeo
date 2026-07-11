FROM --platform=$BUILDPLATFORM golang:1.25-alpine@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587 AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /src
COPY services/traffic-gateway/go.mod ./
COPY services/traffic-gateway/*.go ./

RUN CGO_ENABLED=0 go test ./... \
  && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/traffic-gateway .

FROM scratch

COPY --from=builder /out/traffic-gateway /traffic-gateway

USER 10002:10002

EXPOSE 1080 8080

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD ["/traffic-gateway", "healthcheck"]

ENTRYPOINT ["/traffic-gateway"]
