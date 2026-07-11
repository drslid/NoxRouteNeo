package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type AdminAPI struct {
	secret  string
	config  *ConfigStore
	metrics *Metrics
	sizing  SizingMetadata
}

func NewAdminAPI(secret string, config *ConfigStore, metrics *Metrics, sizing SizingMetadata) *AdminAPI {
	return &AdminAPI{secret: secret, config: config, metrics: metrics, sizing: sizing}
}

func writeJSON(response http.ResponseWriter, status int, payload any) {
	response.Header().Set("Content-Type", "application/json")
	response.Header().Set("Cache-Control", "no-store")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(payload)
}

func (api *AdminAPI) authorized(request *http.Request) bool {
	provided := strings.TrimPrefix(request.Header.Get("Authorization"), "Bearer ")
	if len(provided) != len(api.secret) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(api.secret)) == 1
}

func (api *AdminAPI) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	switch request.URL.Path {
	case "/health":
		if request.Method != http.MethodGet {
			writeJSON(response, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		writeJSON(response, http.StatusOK, map[string]any{
			"status":               "ready",
			"configured":           api.config.Configured(),
			"configuration":        api.config.Snapshot(),
			"connections":          api.metrics.activeConnections.Load(),
			"capacity":             api.sizing.MaximumConnections,
			"sizing":               api.sizing,
			"rejected_connections": api.metrics.rejected.Load(),
			"shed_connections":     api.metrics.shedConnections.Load(),
			"idle_timeouts":        api.metrics.idleTimeouts.Load(),
			"fail_open_grants":     api.metrics.failOpenGrants.Load(),
			"health_probes":        api.metrics.healthProbes.Load(),
		})
	case "/metrics":
		if request.Method != http.MethodGet {
			writeJSON(response, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		writeJSON(response, http.StatusOK, api.metrics.Snapshot())
	case "/v1/config":
		if request.Method != http.MethodPost {
			writeJSON(response, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		if !api.authorized(request) {
			writeJSON(response, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		defer request.Body.Close()
		decoder := json.NewDecoder(io.LimitReader(request.Body, 1<<20))
		decoder.DisallowUnknownFields()
		var config RuntimeConfig
		if err := decoder.Decode(&config); err != nil {
			writeJSON(response, http.StatusBadRequest, map[string]string{"error": "invalid configuration"})
			return
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			writeJSON(response, http.StatusBadRequest, map[string]string{"error": "configuration must contain one JSON object"})
			return
		}
		if err := api.config.Apply(config); err != nil {
			writeJSON(response, http.StatusUnprocessableEntity, map[string]string{"error": fmt.Sprintf("configuration rejected: %s", err)})
			return
		}
		writeJSON(response, http.StatusOK, map[string]any{"status": "applied", "configuration": api.config.Snapshot()})
	default:
		writeJSON(response, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}
