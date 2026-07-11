package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestConfigStoreAuthenticationAndUpdates(t *testing.T) {
	store := NewConfigStore("01234567890123456789012345678901")
	config := RuntimeConfig{
		Revision:        "revision-1",
		GlobalLimitMbps: 100,
		Accounts:        []AccountConfig{{ID: "account-a", LimitMbps: 2}},
	}
	if err := store.Apply(config); err != nil {
		t.Fatalf("apply config: %v", err)
	}
	password := gatewayCredential([]byte("01234567890123456789012345678901"), "account-a")
	account, valid := store.Authenticate("account-a", password)
	if !valid || account == nil {
		t.Fatal("expected account credentials to authenticate")
	}
	if _, valid := store.Authenticate("account-a", "wrong"); valid {
		t.Fatal("invalid password authenticated")
	}
	if snapshot := store.Snapshot(); snapshot.Accounts != 1 || snapshot.GlobalLimitMbps != 100 {
		t.Fatalf("unexpected snapshot: %+v", snapshot)
	}
}

func TestConfigStoreRejectsDuplicateAccounts(t *testing.T) {
	store := NewConfigStore("01234567890123456789012345678901")
	err := store.Apply(RuntimeConfig{
		Revision: "revision-1",
		Accounts: []AccountConfig{{ID: "duplicate"}, {ID: "duplicate"}},
	})
	if err == nil {
		t.Fatal("duplicate account configuration was accepted")
	}
}

func TestRemovedAccountLimiterIsStopped(t *testing.T) {
	store := NewConfigStore("01234567890123456789012345678901")
	if err := store.Apply(RuntimeConfig{
		Revision: "revision-1",
		Accounts: []AccountConfig{{ID: "account-a", LimitMbps: 1}},
	}); err != nil {
		t.Fatal(err)
	}
	password := gatewayCredential([]byte("01234567890123456789012345678901"), "account-a")
	account, valid := store.Authenticate("account-a", password)
	if !valid {
		t.Fatal("account authentication failed")
	}
	if err := store.Apply(RuntimeConfig{Revision: "revision-2"}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := account.Limiter.Wait(ctx, 1024, false); !errors.Is(err, ErrLimiterStopped) {
		t.Fatalf("removed limiter remained active: %v", err)
	}
}
