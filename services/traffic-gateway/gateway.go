package main

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

const (
	socksVersion        = 5
	socksPasswordMethod = 2
	socksNoAcceptable   = 255
	socksConnectCommand = 1
	socksAddressIPv4    = 1
	socksAddressDomain  = 3
	socksAddressIPv6    = 4
	proxyBufferSize     = 8 * 1024
	gatewayProbeHost    = "198.18.0.254"
	gatewayProbePort    = 80
	maximumProbeRequest = 4 * 1024
)

var blockedDestinationPorts = map[int]struct{}{25: {}, 465: {}, 587: {}}

var blockedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("224.0.0.0/4"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("::/128"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("fe80::/10"),
	netip.MustParsePrefix("2001:db8::/32"),
}

type destinationDialer func(context.Context, string, int) (net.Conn, error)

type Gateway struct {
	config         *ConfigStore
	metrics        *Metrics
	registry       *connectionRegistry
	dial           destinationDialer
	maxLimiterWait time.Duration
	priorityBytes  int
	priorityReset  time.Duration
}

func NewGateway(config *ConfigStore, metrics *Metrics, maximumConnections int, minimumIdle, maxLimiterWait time.Duration, priorityBytes int, priorityReset time.Duration) *Gateway {
	gateway := &Gateway{
		config:         config,
		metrics:        metrics,
		registry:       newConnectionRegistry(maximumConnections, minimumIdle, metrics),
		maxLimiterWait: maxLimiterWait,
		priorityBytes:  priorityBytes,
		priorityReset:  priorityReset,
	}
	gateway.dial = gateway.dialPublicDestination
	return gateway
}

func (gateway *Gateway) Serve(listener net.Listener) error {
	var delay time.Duration
	for {
		connection, err := listener.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return nil
			}
			if temporary, ok := err.(interface{ Temporary() bool }); ok && temporary.Temporary() {
				if delay == 0 {
					delay = 5 * time.Millisecond
				} else {
					delay *= 2
				}
				if delay > time.Second {
					delay = time.Second
				}
				time.Sleep(delay)
				continue
			}
			return err
		}
		delay = 0
		go gateway.handleSafely(connection)
	}
}

func (gateway *Gateway) ReapIdle(ctx context.Context, maximumIdle time.Duration) {
	interval := maximumIdle / 4
	if interval < 5*time.Second {
		interval = 5 * time.Second
	}
	if interval > 30*time.Second {
		interval = 30 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			gateway.registry.reapIdle(now, maximumIdle)
		}
	}
}

func (gateway *Gateway) handleSafely(client net.Conn) {
	defer func() {
		if recovered := recover(); recovered != nil {
			gateway.metrics.handlerPanics.Add(1)
			_ = client.Close()
			log.Printf("traffic handler recovered from an internal failure")
		}
	}()
	gateway.handle(client)
}

func readBytes(reader io.Reader, size int) ([]byte, error) {
	payload := make([]byte, size)
	_, err := io.ReadFull(reader, payload)
	return payload, err
}

func (gateway *Gateway) authenticate(client net.Conn) (*AccountState, error) {
	header, err := readBytes(client, 2)
	if err != nil || header[0] != socksVersion || header[1] == 0 {
		return nil, errors.New("invalid SOCKS greeting")
	}
	methods, err := readBytes(client, int(header[1]))
	if err != nil {
		return nil, err
	}
	accepted := false
	for _, method := range methods {
		if method == socksPasswordMethod {
			accepted = true
			break
		}
	}
	if !accepted {
		_, _ = client.Write([]byte{socksVersion, socksNoAcceptable})
		return nil, errors.New("SOCKS password authentication is required")
	}
	if _, err := client.Write([]byte{socksVersion, socksPasswordMethod}); err != nil {
		return nil, err
	}
	authHeader, err := readBytes(client, 2)
	if err != nil || authHeader[0] != 1 || authHeader[1] == 0 {
		return nil, errors.New("invalid SOCKS authentication request")
	}
	username, err := readBytes(client, int(authHeader[1]))
	if err != nil {
		return nil, err
	}
	passwordLength, err := readBytes(client, 1)
	if err != nil || passwordLength[0] == 0 {
		return nil, errors.New("invalid SOCKS password")
	}
	password, err := readBytes(client, int(passwordLength[0]))
	if err != nil {
		return nil, err
	}
	account, valid := gateway.config.Authenticate(string(username), string(password))
	if !valid {
		gateway.metrics.authFailures.Add(1)
		_, _ = client.Write([]byte{1, 1})
		return nil, errors.New("SOCKS authentication failed")
	}
	if _, err := client.Write([]byte{1, 0}); err != nil {
		return nil, err
	}
	return account, nil
}

func readDestination(client net.Conn) (string, int, error) {
	header, err := readBytes(client, 4)
	if err != nil || header[0] != socksVersion || header[1] != socksConnectCommand {
		return "", 0, errors.New("unsupported SOCKS request")
	}
	var host string
	switch header[3] {
	case socksAddressIPv4:
		address, err := readBytes(client, net.IPv4len)
		if err != nil {
			return "", 0, err
		}
		host = net.IP(address).String()
	case socksAddressIPv6:
		address, err := readBytes(client, net.IPv6len)
		if err != nil {
			return "", 0, err
		}
		host = net.IP(address).String()
	case socksAddressDomain:
		length, err := readBytes(client, 1)
		if err != nil || length[0] == 0 {
			return "", 0, errors.New("invalid destination domain")
		}
		domain, err := readBytes(client, int(length[0]))
		if err != nil {
			return "", 0, err
		}
		host = string(domain)
	default:
		return "", 0, errors.New("unsupported destination address type")
	}
	portBytes, err := readBytes(client, 2)
	if err != nil {
		return "", 0, err
	}
	return host, int(binary.BigEndian.Uint16(portBytes)), nil
}

func sendSocksReply(client net.Conn, status byte) error {
	_, err := client.Write([]byte{socksVersion, status, 0, socksAddressIPv4, 0, 0, 0, 0, 0, 0})
	return err
}

func (gateway *Gateway) serveHealthProbe(client net.Conn) {
	if err := sendSocksReply(client, 0); err != nil {
		return
	}
	_ = client.SetDeadline(time.Now().Add(2 * time.Second))
	request := make([]byte, 0, 512)
	buffer := make([]byte, 512)
	for len(request) < maximumProbeRequest {
		count, err := client.Read(buffer)
		if count > 0 {
			request = append(request, buffer[:count]...)
			if strings.Contains(string(request), "\r\n\r\n") {
				break
			}
		}
		if err != nil {
			return
		}
	}
	response := "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
	if _, err := io.WriteString(client, response); err == nil {
		gateway.metrics.healthProbes.Add(1)
	}
}

func allowedPublicAddress(address netip.Addr) bool {
	if !address.IsValid() || !address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() || address.IsLinkLocalUnicast() {
		return false
	}
	for _, prefix := range blockedPrefixes {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}

func (gateway *Gateway) dialPublicDestination(ctx context.Context, host string, port int) (net.Conn, error) {
	if _, blocked := blockedDestinationPorts[port]; blocked {
		return nil, errors.New("destination port is blocked")
	}
	var addresses []netip.Addr
	if parsed, err := netip.ParseAddr(strings.TrimSpace(host)); err == nil {
		addresses = append(addresses, parsed.Unmap())
	} else {
		resolved, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, errors.New("destination resolution failed")
		}
		for _, address := range resolved {
			addresses = append(addresses, address.Unmap())
		}
	}
	dialer := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	for _, address := range addresses {
		if !allowedPublicAddress(address) {
			continue
		}
		connection, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(address.String(), strconv.Itoa(port)))
		if err == nil {
			return connection, nil
		}
	}
	return nil, errors.New("destination did not resolve to an allowed public address")
}

func (gateway *Gateway) handle(client net.Conn) {
	defer client.Close()
	_ = client.SetDeadline(time.Now().Add(15 * time.Second))
	account, err := gateway.authenticate(client)
	if err != nil {
		return
	}
	host, port, err := readDestination(client)
	if err != nil {
		_ = sendSocksReply(client, 7)
		return
	}
	if host == gatewayProbeHost && port == gatewayProbePort {
		gateway.serveHealthProbe(client)
		return
	}
	tracked, admitted := gateway.registry.admit(client)
	if !admitted {
		_ = sendSocksReply(client, 1)
		return
	}
	defer gateway.registry.remove(tracked)
	defer tracked.Close()

	dialContext, cancelDial := context.WithTimeout(context.Background(), 15*time.Second)
	remote, err := gateway.dial(dialContext, host, port)
	cancelDial()
	if err != nil {
		_ = sendSocksReply(client, 5)
		return
	}
	if !tracked.setRemote(remote) {
		return
	}
	if err := sendSocksReply(client, 0); err != nil {
		return
	}
	_ = client.SetDeadline(time.Time{})
	_ = remote.SetDeadline(time.Time{})
	gateway.metrics.accepted.Add(1)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	relayErrors := make(chan error, 2)
	go func() {
		err := gateway.proxyCopy(ctx, remote, client, tracked, account, true)
		if err == nil {
			closeWrite(remote)
		}
		relayErrors <- err
	}()
	go func() {
		err := gateway.proxyCopy(ctx, client, remote, tracked, account, false)
		if err == nil {
			closeWrite(client)
		}
		relayErrors <- err
	}()
	firstError := <-relayErrors
	if firstError != nil {
		cancel()
		tracked.Close()
		<-relayErrors
		return
	}
	select {
	case <-relayErrors:
	case <-time.After(30 * time.Second):
	}
	cancel()
	tracked.Close()
}

func closeWrite(connection net.Conn) {
	if halfCloser, ok := connection.(interface{ CloseWrite() error }); ok {
		_ = halfCloser.CloseWrite()
		return
	}
	_ = connection.Close()
}

func (gateway *Gateway) proxyCopy(ctx context.Context, destination, source net.Conn, tracked *trackedConnection, account *AccountState, uplink bool) error {
	buffer := make([]byte, proxyBufferSize)
	priorityRemaining := gateway.priorityBytes
	lastRead := time.Now()
	for {
		read, err := source.Read(buffer)
		if read > 0 {
			now := time.Now()
			if now.Sub(lastRead) >= gateway.priorityReset {
				priorityRemaining = gateway.priorityBytes
			}
			lastRead = now
			priority := priorityRemaining > 0
			if priorityRemaining > 0 {
				priorityRemaining = max(0, priorityRemaining-read)
			}
			waitContext, cancel := context.WithTimeout(ctx, gateway.maxLimiterWait)
			limitError := account.Limiter.Wait(waitContext, read, priority)
			if limitError == nil {
				limitError = gateway.config.GlobalLimiter().Wait(waitContext, read, priority)
			}
			cancel()
			if limitError != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				gateway.metrics.failOpenGrants.Add(1)
			}
			written := 0
			for written < read {
				count, writeErr := destination.Write(buffer[written:read])
				if writeErr != nil {
					return writeErr
				}
				written += count
			}
			tracked.touch()
			if uplink {
				gateway.metrics.uplinkBytes.Add(uint64(read))
			} else {
				gateway.metrics.downlinkBytes.Add(uint64(read))
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return fmt.Errorf("relay failed: %w", err)
		}
	}
}
