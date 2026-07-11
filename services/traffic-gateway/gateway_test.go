package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"testing"
	"time"
)

func startTestGateway(t *testing.T) (string, string, *Metrics, func()) {
	return startTestGatewayWithCapacity(t, 128)
}

func startTestGatewayWithCapacity(t *testing.T, capacity int) (string, string, *Metrics, func()) {
	t.Helper()
	secret := "01234567890123456789012345678901"
	config := NewConfigStore(secret)
	if err := config.Apply(RuntimeConfig{
		Revision: "test",
		Accounts: []AccountConfig{{ID: "account-a", LimitMbps: 0}},
	}); err != nil {
		t.Fatalf("apply config: %v", err)
	}
	metrics := &Metrics{}
	gateway := NewGateway(config, metrics, capacity, time.Second, time.Second, 4096, 100*time.Millisecond)
	gateway.dial = func(_ context.Context, _ string, _ int) (net.Conn, error) {
		client, server := net.Pipe()
		go func() {
			defer server.Close()
			_, _ = io.Copy(server, server)
		}()
		return client, nil
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go func() { _ = gateway.Serve(listener) }()
	return listener.Addr().String(), gatewayCredential([]byte(secret), "account-a"), metrics, func() { _ = listener.Close() }
}

func connectTestSocks(address, password string) (net.Conn, error) {
	return connectTestSocksDestination(address, password, "example.com", 443)
}

func connectTestSocksDestination(address, password, destinationHost string, destinationPort int) (net.Conn, error) {
	connection, err := net.DialTimeout("tcp", address, time.Second)
	if err != nil {
		return nil, err
	}
	_ = connection.SetDeadline(time.Now().Add(5 * time.Second))

	if _, err := connection.Write([]byte{5, 1, 2}); err != nil {
		_ = connection.Close()
		return nil, err
	}
	method := make([]byte, 2)
	if _, err := io.ReadFull(connection, method); err != nil || method[1] != 2 {
		_ = connection.Close()
		return nil, errors.New("unexpected SOCKS authentication method")
	}
	username := []byte("account-a")
	passwordBytes := []byte(password)
	auth := append([]byte{1, byte(len(username))}, username...)
	auth = append(auth, byte(len(passwordBytes)))
	auth = append(auth, passwordBytes...)
	if _, err := connection.Write(auth); err != nil {
		_ = connection.Close()
		return nil, err
	}
	authReply := make([]byte, 2)
	if _, err := io.ReadFull(connection, authReply); err != nil || authReply[1] != 0 {
		_ = connection.Close()
		return nil, errors.New("SOCKS authentication failed")
	}
	host := []byte(destinationHost)
	request := append([]byte{5, 1, 0, 3, byte(len(host))}, host...)
	port := make([]byte, 2)
	binary.BigEndian.PutUint16(port, uint16(destinationPort))
	request = append(request, port...)
	if _, err := connection.Write(request); err != nil {
		_ = connection.Close()
		return nil, err
	}
	reply := make([]byte, 10)
	if _, err := io.ReadFull(connection, reply); err != nil || reply[1] != 0 {
		_ = connection.Close()
		return nil, errors.New("SOCKS destination connection failed")
	}
	_ = connection.SetDeadline(time.Time{})
	return connection, nil
}

func TestSyntheticHealthProbeDoesNotConsumeConnectionCapacity(t *testing.T) {
	address, password, metrics, stop := startTestGateway(t)
	defer stop()
	connection, err := connectTestSocksDestination(address, password, gatewayProbeHost, gatewayProbePort)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	if _, err := io.WriteString(connection, "GET /generate_204 HTTP/1.1\r\nHost: probe\r\nConnection: close\r\n\r\n"); err != nil {
		t.Fatal(err)
	}
	response, err := io.ReadAll(connection)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(response, []byte("204 No Content")) {
		t.Fatalf("unexpected probe response: %q", response)
	}
	if metrics.healthProbes.Load() != 1 || metrics.activeConnections.Load() != 0 {
		t.Fatalf("probe affected user capacity: probes=%d active=%d", metrics.healthProbes.Load(), metrics.activeConnections.Load())
	}
}

func TestAuthenticatedSocksConnectionRelaysTraffic(t *testing.T) {
	address, password, metrics, stop := startTestGateway(t)
	defer stop()
	connection, err := connectTestSocks(address, password)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	payload := []byte("noxroute-gateway-test")
	if _, err := connection.Write(payload); err != nil {
		t.Fatal(err)
	}
	echoed := make([]byte, len(payload))
	if _, err := io.ReadFull(connection, echoed); err != nil || string(echoed) != string(payload) {
		t.Fatalf("relay failed: %q %v", echoed, err)
	}
	if metrics.accepted.Load() != 1 {
		t.Fatalf("expected one accepted connection, got %d", metrics.accepted.Load())
	}
}

func TestGatewayHandlesOneThousandConcurrentConnections(t *testing.T) {
	const total = 1000
	address, password, metrics, stop := startTestGatewayWithCapacity(t, 2048)
	defer stop()

	connections := make(chan net.Conn, total)
	errorsChannel := make(chan error, total)
	for range total {
		go func() {
			connection, err := connectTestSocks(address, password)
			if err != nil {
				errorsChannel <- err
				return
			}
			connections <- connection
		}()
	}

	active := make([]net.Conn, 0, total)
	deadline := time.After(15 * time.Second)
	for len(active) < total {
		select {
		case connection := <-connections:
			active = append(active, connection)
		case err := <-errorsChannel:
			for _, connection := range active {
				_ = connection.Close()
			}
			t.Fatalf("concurrent connection failed: %v", err)
		case <-deadline:
			for _, connection := range active {
				_ = connection.Close()
			}
			t.Fatalf("only %d of %d connections became ready", len(active), total)
		}
	}
	if current := metrics.activeConnections.Load(); current != total {
		t.Fatalf("expected %d tracked connections, got %d", total, current)
	}
	for _, connection := range active {
		_ = connection.Close()
	}
	for attempt := 0; attempt < 100 && metrics.activeConnections.Load() != 0; attempt++ {
		time.Sleep(10 * time.Millisecond)
	}
	if current := metrics.activeConnections.Load(); current != 0 {
		t.Fatalf("connections were not released after the peak: %d", current)
	}

	connection, err := connectTestSocks(address, password)
	if err != nil {
		t.Fatalf("new navigation failed after the peak: %v", err)
	}
	_ = connection.Close()
	if metrics.handlerPanics.Load() != 0 {
		t.Fatalf("gateway panicked under load: %d", metrics.handlerPanics.Load())
	}
}
