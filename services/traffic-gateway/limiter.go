package main

import (
	"context"
	"errors"
	"math"
	"sync"
	"time"
)

var ErrLimiterStopped = errors.New("limiter stopped")

const minimumBucketCapacity = 64 * 1024

type grantRequest struct {
	bytes    int
	priority bool
	context  context.Context
	granted  chan struct{}
}

type FairLimiter struct {
	mu        sync.Mutex
	rateBytes float64
	capacity  float64
	tokens    float64
	updatedAt time.Time
	high      []*grantRequest
	normal    []*grantRequest
	wake      chan struct{}
	stop      chan struct{}
	stopOnce  sync.Once
}

func NewFairLimiter(mbps int) *FairLimiter {
	limiter := &FairLimiter{
		wake: make(chan struct{}, 1),
		stop: make(chan struct{}),
	}
	limiter.setRateLocked(mbps, time.Now())
	go limiter.run()
	return limiter
}

func (limiter *FairLimiter) setRateLocked(mbps int, now time.Time) {
	previousRate := limiter.rateBytes
	limiter.replenishLocked(now)
	limiter.rateBytes = float64(max(0, mbps)) * 1_000_000 / 8
	limiter.capacity = math.Max(limiter.rateBytes*0.5, minimumBucketCapacity)
	if limiter.updatedAt.IsZero() || previousRate == 0 {
		limiter.tokens = limiter.capacity
	} else {
		limiter.tokens = math.Min(limiter.tokens, limiter.capacity)
	}
	limiter.updatedAt = now
}

func (limiter *FairLimiter) SetMbps(mbps int) {
	limiter.mu.Lock()
	limiter.setRateLocked(mbps, time.Now())
	limiter.mu.Unlock()
	limiter.signal()
}

func (limiter *FairLimiter) Wait(ctx context.Context, bytes int, priority bool) error {
	if bytes <= 0 {
		return nil
	}
	request := &grantRequest{
		bytes:    bytes,
		priority: priority,
		context:  ctx,
		granted:  make(chan struct{}),
	}
	limiter.mu.Lock()
	if priority {
		limiter.high = append(limiter.high, request)
	} else {
		limiter.normal = append(limiter.normal, request)
	}
	limiter.mu.Unlock()
	limiter.signal()

	select {
	case <-request.granted:
		return nil
	case <-ctx.Done():
		limiter.signal()
		return ctx.Err()
	case <-limiter.stop:
		return ErrLimiterStopped
	}
}

func (limiter *FairLimiter) Stop() {
	limiter.stopOnce.Do(func() {
		close(limiter.stop)
		limiter.signal()
	})
}

func (limiter *FairLimiter) signal() {
	select {
	case limiter.wake <- struct{}{}:
	default:
	}
}

func (limiter *FairLimiter) replenishLocked(now time.Time) {
	if limiter.updatedAt.IsZero() {
		limiter.updatedAt = now
		return
	}
	if limiter.rateBytes <= 0 {
		limiter.tokens = limiter.capacity
		limiter.updatedAt = now
		return
	}
	elapsed := now.Sub(limiter.updatedAt).Seconds()
	limiter.tokens = math.Min(limiter.capacity, limiter.tokens+elapsed*limiter.rateBytes)
	limiter.updatedAt = now
}

func removeCanceled(queue []*grantRequest) []*grantRequest {
	kept := queue[:0]
	for _, request := range queue {
		select {
		case <-request.context.Done():
			continue
		default:
			kept = append(kept, request)
		}
	}
	return kept
}

func (limiter *FairLimiter) nextDelay() (time.Duration, bool) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	limiter.high = removeCanceled(limiter.high)
	limiter.normal = removeCanceled(limiter.normal)
	if len(limiter.high) == 0 && len(limiter.normal) == 0 {
		return 0, false
	}
	limiter.replenishLocked(time.Now())

	var request *grantRequest
	if len(limiter.high) > 0 {
		request = limiter.high[0]
	} else {
		request = limiter.normal[0]
	}
	if limiter.rateBytes <= 0 || limiter.tokens >= float64(request.bytes) {
		if limiter.rateBytes > 0 {
			limiter.tokens -= float64(request.bytes)
		}
		if request.priority {
			limiter.high = limiter.high[1:]
		} else {
			limiter.normal = limiter.normal[1:]
		}
		close(request.granted)
		return 0, true
	}

	missing := float64(request.bytes) - limiter.tokens
	delay := time.Duration(missing / limiter.rateBytes * float64(time.Second))
	if delay < time.Millisecond {
		delay = time.Millisecond
	}
	return delay, true
}

func (limiter *FairLimiter) run() {
	for {
		select {
		case <-limiter.wake:
		case <-limiter.stop:
			return
		}
		for {
			delay, pending := limiter.nextDelay()
			if !pending {
				break
			}
			if delay == 0 {
				continue
			}
			timer := time.NewTimer(delay)
			select {
			case <-timer.C:
			case <-limiter.wake:
				if !timer.Stop() {
					<-timer.C
				}
			case <-limiter.stop:
				if !timer.Stop() {
					<-timer.C
				}
				return
			}
		}
	}
}
