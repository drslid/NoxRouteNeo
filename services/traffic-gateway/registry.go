package main

import (
	"net"
	"sync"
	"sync/atomic"
	"time"
)

type trackedConnection struct {
	id           uint64
	client       net.Conn
	remoteMu     sync.Mutex
	remote       net.Conn
	closed       bool
	lastActivity atomic.Int64
	closeOnce    sync.Once
}

func newTrackedConnection(id uint64, client net.Conn) *trackedConnection {
	connection := &trackedConnection{id: id, client: client}
	connection.touch()
	return connection
}

func (connection *trackedConnection) touch() {
	connection.lastActivity.Store(time.Now().UnixNano())
}

func (connection *trackedConnection) idleFor(now time.Time) time.Duration {
	return now.Sub(time.Unix(0, connection.lastActivity.Load()))
}

func (connection *trackedConnection) setRemote(remote net.Conn) bool {
	connection.remoteMu.Lock()
	defer connection.remoteMu.Unlock()
	if connection.closed {
		_ = remote.Close()
		return false
	}
	connection.remote = remote
	return true
}

func (connection *trackedConnection) Close() {
	connection.closeOnce.Do(func() {
		_ = connection.client.Close()
		connection.remoteMu.Lock()
		connection.closed = true
		if connection.remote != nil {
			_ = connection.remote.Close()
		}
		connection.remoteMu.Unlock()
	})
}

type connectionRegistry struct {
	mu          sync.Mutex
	connections map[uint64]*trackedConnection
	nextID      uint64
	maximum     int
	minimumIdle time.Duration
	metrics     *Metrics
}

func newConnectionRegistry(maximum int, minimumIdle time.Duration, metrics *Metrics) *connectionRegistry {
	return &connectionRegistry{
		connections: make(map[uint64]*trackedConnection),
		maximum:     maximum,
		minimumIdle: minimumIdle,
		metrics:     metrics,
	}
}

func (registry *connectionRegistry) admit(client net.Conn) (*trackedConnection, bool) {
	registry.mu.Lock()
	var victim *trackedConnection
	if len(registry.connections) >= registry.maximum {
		now := time.Now()
		for _, candidate := range registry.connections {
			if candidate.idleFor(now) < registry.minimumIdle {
				continue
			}
			if victim == nil || candidate.lastActivity.Load() < victim.lastActivity.Load() {
				victim = candidate
			}
		}
		if victim == nil {
			registry.mu.Unlock()
			registry.metrics.rejected.Add(1)
			return nil, false
		}
		delete(registry.connections, victim.id)
		registry.metrics.shedConnections.Add(1)
	}
	registry.nextID++
	connection := newTrackedConnection(registry.nextID, client)
	registry.connections[connection.id] = connection
	registry.metrics.activeConnections.Store(int64(len(registry.connections)))
	registry.mu.Unlock()
	if victim != nil {
		victim.Close()
	}
	return connection, true
}

func (registry *connectionRegistry) remove(connection *trackedConnection) {
	registry.mu.Lock()
	delete(registry.connections, connection.id)
	registry.metrics.activeConnections.Store(int64(len(registry.connections)))
	registry.mu.Unlock()
}

func (registry *connectionRegistry) reapIdle(now time.Time, maximumIdle time.Duration) int {
	registry.mu.Lock()
	victims := make([]*trackedConnection, 0)
	for id, connection := range registry.connections {
		if connection.idleFor(now) < maximumIdle {
			continue
		}
		delete(registry.connections, id)
		victims = append(victims, connection)
	}
	registry.metrics.activeConnections.Store(int64(len(registry.connections)))
	registry.mu.Unlock()

	for _, victim := range victims {
		victim.Close()
	}
	if len(victims) > 0 {
		registry.metrics.idleTimeouts.Add(uint64(len(victims)))
	}
	return len(victims)
}
