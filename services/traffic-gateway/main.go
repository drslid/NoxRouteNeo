package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

func environmentInt(name string, fallback int) int {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		log.Fatalf("%s must be an integer", name)
	}
	return parsed
}

func environmentDuration(name string, fallback time.Duration) time.Duration {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		log.Fatalf("%s must be a duration", name)
	}
	return parsed
}

func runHealthcheck() error {
	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Get("http://127.0.0.1:8080/health")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("health endpoint returned %d", response.StatusCode)
	}
	return nil
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "healthcheck" {
		if err := runHealthcheck(); err != nil {
			log.Print(err)
			os.Exit(1)
		}
		return
	}

	secret := os.Getenv("TRAFFIC_GATEWAY_TOKEN")
	if len(secret) < 32 {
		log.Fatal("TRAFFIC_GATEWAY_TOKEN must contain at least 32 characters")
	}
	maximumConnections := environmentInt("MAX_CONNECTIONS", 4096)
	if maximumConnections < 64 {
		log.Fatal("MAX_CONNECTIONS must be at least 64")
	}
	minimumIdle := environmentDuration("MINIMUM_IDLE_TO_SHED", 30*time.Second)
	maximumIdle := environmentDuration("MAX_CONNECTION_IDLE", 10*time.Minute)
	maxLimiterWait := environmentDuration("MAX_LIMITER_WAIT", time.Second)
	priorityBytes := environmentInt("PRIORITY_BYTES_PER_DIRECTION", 32*1024)
	priorityReset := environmentDuration("PRIORITY_RESET_AFTER_IDLE", 750*time.Millisecond)
	if minimumIdle < 0 || maximumIdle <= 0 || maxLimiterWait <= 0 || priorityBytes < 0 || priorityReset <= 0 {
		log.Fatal("gateway timing and priority settings are invalid")
	}

	metrics := &Metrics{}
	config := NewConfigStore(secret)
	gateway := NewGateway(config, metrics, maximumConnections, minimumIdle, maxLimiterWait, priorityBytes, priorityReset)
	adminAPI := NewAdminAPI(secret, config, metrics, maximumConnections)

	socksListener, err := net.Listen("tcp", ":1080")
	if err != nil {
		log.Fatalf("SOCKS listener failed: %v", err)
	}
	adminServer := &http.Server{
		Addr:              ":8080",
		Handler:           adminAPI,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       30 * time.Second,
	}

	stopContext, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	errorsChannel := make(chan error, 2)
	go func() { errorsChannel <- gateway.Serve(socksListener) }()
	go gateway.ReapIdle(stopContext, maximumIdle)
	go func() {
		err := adminServer.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		errorsChannel <- err
	}()

	log.Printf("traffic gateway ready with capacity %d and idle timeout %s", maximumConnections, maximumIdle)
	select {
	case <-stopContext.Done():
	case err := <-errorsChannel:
		if err != nil {
			log.Printf("traffic gateway stopped unexpectedly: %v", err)
		}
	}
	_ = socksListener.Close()
	shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = adminServer.Shutdown(shutdownContext)
}
