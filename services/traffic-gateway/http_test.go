package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAdminAPIProtectsConfigurationEndpoint(t *testing.T) {
	const secret = "01234567890123456789012345678901"
	store := NewConfigStore(secret)
	server := httptest.NewServer(NewAdminAPI(secret, store, &Metrics{}, 4096))
	defer server.Close()

	payload := []byte(`{"revision":"revision-1","global_limit_mbps":50,"accounts":[{"id":"account-a","limit_mbps":5}]}`)
	unauthorized, err := http.Post(server.URL+"/v1/config", "application/json", bytes.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	defer unauthorized.Body.Close()
	if unauthorized.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized response, got %d", unauthorized.StatusCode)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/v1/config", bytes.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+secret)
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected accepted configuration, got %d: %s", response.StatusCode, body)
	}
	if snapshot := store.Snapshot(); snapshot.Accounts != 1 || snapshot.GlobalLimitMbps != 50 {
		t.Fatalf("configuration was not applied: %+v", snapshot)
	}
}

func TestHealthDoesNotExposeCredentialsOrAccountIDs(t *testing.T) {
	const secret = "01234567890123456789012345678901"
	store := NewConfigStore(secret)
	if err := store.Apply(RuntimeConfig{Revision: "revision-1", Accounts: []AccountConfig{{ID: "private-account"}}}); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(NewAdminAPI(secret, store, &Metrics{}, 4096))
	defer server.Close()

	response, err := http.Get(server.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	text := string(body)
	if strings.Contains(text, secret) || strings.Contains(text, "private-account") {
		t.Fatalf("health response exposed private configuration: %s", text)
	}
}
