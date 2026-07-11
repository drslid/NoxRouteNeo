package main

import (
	"testing"
	"time"
)

func TestAutomaticSizingUsesTheLowestResourceBudget(t *testing.T) {
	tests := []struct {
		name        string
		cpus        int
		memoryMiB   int
		capacity    int
		profile     string
		bandwidth   int
		maximumIdle int
	}{
		{"compact", 1, 512, 1024, "compact", 50, 300},
		{"small", 2, 1024, 2048, "small", 100, 420},
		{"standard", 2, 2048, 4096, "standard", 250, 600},
		{"performance", 4, 4096, 8192, "performance", 500, 900},
		{"bounded", 32, 65536, 16384, "high-capacity", 1000, 1200},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := calculateAutomaticSizing(test.cpus, test.memoryMiB)
			if result.MaximumConnections != test.capacity || result.Profile != test.profile {
				t.Fatalf("unexpected sizing: %+v", result)
			}
			if result.RecommendedBandwidthMbps != test.bandwidth || result.MaximumIdleSeconds != test.maximumIdle {
				t.Fatalf("unexpected policies: %+v", result)
			}
		})
	}
}

func TestManualCapacityKeepsDetectedHostResources(t *testing.T) {
	automatic := calculateAutomaticSizing(2, 1024)
	resolved, err := resolveConnectionSizing("6000", automatic)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Mode != "manual" || resolved.MaximumConnections != 6000 {
		t.Fatalf("manual capacity was not applied: %+v", resolved)
	}
	if resolved.CPUCount != 2 || resolved.MemoryMiB != 1024 {
		t.Fatalf("detected resources were lost: %+v", resolved)
	}
	if resolved.Profile != automatic.Profile || resolved.MaximumIdleSeconds != automatic.MaximumIdleSeconds {
		t.Fatalf("manual capacity changed the hardware profile: %+v", resolved)
	}
}

func TestCPUQuotaCountIsConservativeForFractionalCPU(t *testing.T) {
	if cpuQuotaCount(100000, 100000) != 1 {
		t.Fatal("one CPU quota was not detected")
	}
	if cpuQuotaCount(350000, 100000) != 3 {
		t.Fatal("fractional CPU quota was not rounded down")
	}
	if cpuQuotaCount(-1, 100000) != 0 {
		t.Fatal("unlimited CPU quota should not override the host count")
	}
}

func TestAutomaticDurationAllowsAnExplicitOverride(t *testing.T) {
	resolved, err := resolveAutomaticDuration("auto", 7*time.Minute)
	if err != nil || resolved != 7*time.Minute {
		t.Fatalf("automatic duration failed: %s %v", resolved, err)
	}
	resolved, err = resolveAutomaticDuration("45s", 7*time.Minute)
	if err != nil || resolved != 45*time.Second {
		t.Fatalf("duration override failed: %s %v", resolved, err)
	}
}
