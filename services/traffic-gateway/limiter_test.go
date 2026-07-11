package main

import (
	"context"
	"testing"
	"time"
)

func TestUnlimitedLimiterReturnsImmediately(t *testing.T) {
	limiter := NewFairLimiter(0)
	defer limiter.Stop()
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if err := limiter.Wait(ctx, 1024*1024, false); err != nil {
		t.Fatalf("unlimited limiter blocked: %v", err)
	}
}

func TestPriorityRequestMovesAheadOfBulkQueue(t *testing.T) {
	limiter := NewFairLimiter(1)
	defer limiter.Stop()
	if err := limiter.Wait(context.Background(), minimumBucketCapacity, false); err != nil {
		t.Fatalf("drain initial bucket: %v", err)
	}

	bulkDone := make(chan struct{})
	go func() {
		_ = limiter.Wait(context.Background(), 48*1024, false)
		close(bulkDone)
	}()
	time.Sleep(10 * time.Millisecond)
	priorityDone := make(chan struct{})
	go func() {
		_ = limiter.Wait(context.Background(), 1024, true)
		close(priorityDone)
	}()

	select {
	case <-priorityDone:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("priority request was held behind bulk traffic")
	}
	select {
	case <-bulkDone:
		t.Fatal("bulk request completed before its expected token refill")
	default:
	}
}

func TestLimiterHonorsCancellation(t *testing.T) {
	limiter := NewFairLimiter(1)
	defer limiter.Stop()
	if err := limiter.Wait(context.Background(), minimumBucketCapacity, false); err != nil {
		t.Fatalf("drain initial bucket: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := limiter.Wait(ctx, 32*1024, false); err == nil {
		t.Fatal("expected limiter wait to be canceled")
	}
}
