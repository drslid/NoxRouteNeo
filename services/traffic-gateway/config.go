package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
)

var accountIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

type AccountConfig struct {
	ID        string `json:"id"`
	LimitMbps int    `json:"limit_mbps"`
}

type RuntimeConfig struct {
	Revision        string          `json:"revision"`
	GlobalLimitMbps int             `json:"global_limit_mbps"`
	Accounts        []AccountConfig `json:"accounts"`
}

type AccountState struct {
	ID      string
	Limiter *FairLimiter
}

type ConfigSnapshot struct {
	Revision        string `json:"revision"`
	GlobalLimitMbps int    `json:"global_limit_mbps"`
	Accounts        int    `json:"accounts"`
}

type ConfigStore struct {
	mu         sync.RWMutex
	secret     []byte
	revision   string
	globalMbps int
	global     *FairLimiter
	accounts   map[string]*AccountState
	configured bool
}

func NewConfigStore(secret string) *ConfigStore {
	return &ConfigStore{
		secret:   []byte(secret),
		global:   NewFairLimiter(0),
		accounts: make(map[string]*AccountState),
	}
}

func gatewayCredential(secret []byte, accountID string) string {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(accountID))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func validateRuntimeConfig(config RuntimeConfig) error {
	if strings.TrimSpace(config.Revision) == "" || len(config.Revision) > 128 {
		return errors.New("revision must contain between 1 and 128 characters")
	}
	if config.GlobalLimitMbps < 0 || config.GlobalLimitMbps > 100_000 {
		return errors.New("global_limit_mbps is outside the supported range")
	}
	seen := make(map[string]struct{}, len(config.Accounts))
	for _, account := range config.Accounts {
		if !accountIDPattern.MatchString(account.ID) {
			return errors.New("account id must contain only safe ASCII characters")
		}
		if account.LimitMbps < 0 || account.LimitMbps > 100_000 {
			return fmt.Errorf("limit for account %q is outside the supported range", account.ID)
		}
		if _, exists := seen[account.ID]; exists {
			return fmt.Errorf("duplicate account %q", account.ID)
		}
		seen[account.ID] = struct{}{}
	}
	return nil
}

func (store *ConfigStore) Apply(config RuntimeConfig) error {
	if err := validateRuntimeConfig(config); err != nil {
		return err
	}

	store.mu.Lock()
	store.global.SetMbps(config.GlobalLimitMbps)
	nextAccounts := make(map[string]*AccountState, len(config.Accounts))
	for _, account := range config.Accounts {
		state := store.accounts[account.ID]
		if state == nil {
			state = &AccountState{ID: account.ID, Limiter: NewFairLimiter(account.LimitMbps)}
		} else {
			state.Limiter.SetMbps(account.LimitMbps)
		}
		nextAccounts[account.ID] = state
	}
	retired := make([]*FairLimiter, 0)
	for id, state := range store.accounts {
		if _, active := nextAccounts[id]; !active {
			retired = append(retired, state.Limiter)
		}
	}
	store.accounts = nextAccounts
	store.revision = config.Revision
	store.globalMbps = config.GlobalLimitMbps
	store.configured = true
	store.mu.Unlock()

	for _, limiter := range retired {
		limiter.Stop()
	}
	return nil
}

func (store *ConfigStore) Authenticate(username, password string) (*AccountState, bool) {
	store.mu.RLock()
	account := store.accounts[username]
	expected := gatewayCredential(store.secret, username)
	store.mu.RUnlock()
	if account == nil || len(expected) != len(password) {
		return nil, false
	}
	if subtle.ConstantTimeCompare([]byte(expected), []byte(password)) != 1 {
		return nil, false
	}
	return account, true
}

func (store *ConfigStore) GlobalLimiter() *FairLimiter {
	return store.global
}

func (store *ConfigStore) Snapshot() ConfigSnapshot {
	store.mu.RLock()
	defer store.mu.RUnlock()
	return ConfigSnapshot{
		Revision:        store.revision,
		GlobalLimitMbps: store.globalMbps,
		Accounts:        len(store.accounts),
	}
}

func (store *ConfigStore) Configured() bool {
	store.mu.RLock()
	defer store.mu.RUnlock()
	return store.configured
}
