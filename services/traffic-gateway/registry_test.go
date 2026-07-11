package main

import (
	"net"
	"testing"
	"time"
)

func TestRegistryShedsOldestIdleConnection(t *testing.T) {
	metrics := &Metrics{}
	registry := newConnectionRegistry(1, 0, metrics)
	firstClient, firstPeer := net.Pipe()
	defer firstPeer.Close()
	first, admitted := registry.admit(firstClient)
	if !admitted {
		t.Fatal("first connection was rejected")
	}

	secondClient, secondPeer := net.Pipe()
	defer secondPeer.Close()
	second, admitted := registry.admit(secondClient)
	if !admitted {
		t.Fatal("new connection was rejected instead of shedding an idle connection")
	}
	defer second.Close()
	registry.remove(second)
	registry.remove(first)
	if metrics.shedConnections.Load() != 1 {
		t.Fatalf("expected one shed connection, got %d", metrics.shedConnections.Load())
	}
	if metrics.activeConnections.Load() != 0 {
		t.Fatalf("registry leaked active connections: %d", metrics.activeConnections.Load())
	}
}

func TestRegistryReapsOnlyExpiredIdleConnections(t *testing.T) {
	metrics := &Metrics{}
	registry := newConnectionRegistry(4, time.Second, metrics)

	staleClient, stalePeer := net.Pipe()
	defer stalePeer.Close()
	stale, admitted := registry.admit(staleClient)
	if !admitted {
		t.Fatal("stale test connection was rejected")
	}
	stale.lastActivity.Store(time.Now().Add(-2 * time.Minute).UnixNano())

	activeClient, activePeer := net.Pipe()
	defer activePeer.Close()
	active, admitted := registry.admit(activeClient)
	if !admitted {
		t.Fatal("active test connection was rejected")
	}
	defer active.Close()

	reaped := registry.reapIdle(time.Now(), time.Minute)
	if reaped != 1 {
		t.Fatalf("expected one idle connection to be reaped, got %d", reaped)
	}
	if metrics.idleTimeouts.Load() != 1 {
		t.Fatalf("expected one idle timeout, got %d", metrics.idleTimeouts.Load())
	}
	if metrics.activeConnections.Load() != 1 {
		t.Fatalf("expected one active connection, got %d", metrics.activeConnections.Load())
	}

	registry.remove(active)
	registry.remove(stale)
}
