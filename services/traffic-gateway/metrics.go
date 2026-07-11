package main

import "sync/atomic"

type Metrics struct {
	activeConnections atomic.Int64
	accepted          atomic.Uint64
	rejected          atomic.Uint64
	authFailures      atomic.Uint64
	shedConnections   atomic.Uint64
	idleTimeouts      atomic.Uint64
	failOpenGrants    atomic.Uint64
	healthProbes      atomic.Uint64
	handlerPanics     atomic.Uint64
	uplinkBytes       atomic.Uint64
	downlinkBytes     atomic.Uint64
}

type MetricsSnapshot struct {
	ActiveConnections int64  `json:"active_connections"`
	Accepted          uint64 `json:"accepted"`
	Rejected          uint64 `json:"rejected"`
	AuthFailures      uint64 `json:"auth_failures"`
	ShedConnections   uint64 `json:"shed_connections"`
	IdleTimeouts      uint64 `json:"idle_timeouts"`
	FailOpenGrants    uint64 `json:"fail_open_grants"`
	HealthProbes      uint64 `json:"health_probes"`
	HandlerPanics     uint64 `json:"handler_panics"`
	UplinkBytes       uint64 `json:"uplink_bytes"`
	DownlinkBytes     uint64 `json:"downlink_bytes"`
}

func (metrics *Metrics) Snapshot() MetricsSnapshot {
	return MetricsSnapshot{
		ActiveConnections: metrics.activeConnections.Load(),
		Accepted:          metrics.accepted.Load(),
		Rejected:          metrics.rejected.Load(),
		AuthFailures:      metrics.authFailures.Load(),
		ShedConnections:   metrics.shedConnections.Load(),
		IdleTimeouts:      metrics.idleTimeouts.Load(),
		FailOpenGrants:    metrics.failOpenGrants.Load(),
		HealthProbes:      metrics.healthProbes.Load(),
		HandlerPanics:     metrics.handlerPanics.Load(),
		UplinkBytes:       metrics.uplinkBytes.Load(),
		DownlinkBytes:     metrics.downlinkBytes.Load(),
	}
}
