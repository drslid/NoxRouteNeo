package main

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	minimumAutomaticConnections = 512
	maximumAutomaticConnections = 16384
	maximumManualConnections    = 30000
)

type SizingMetadata struct {
	Mode                     string `json:"mode"`
	Profile                  string `json:"profile"`
	CPUCount                 int    `json:"cpu_count"`
	MemoryMiB                int    `json:"memory_mib"`
	MaximumConnections       int    `json:"maximum_connections"`
	MinimumIdleSeconds       int    `json:"minimum_idle_seconds"`
	MaximumIdleSeconds       int    `json:"maximum_idle_seconds"`
	RecommendedBandwidthMbps int    `json:"recommended_bandwidth_mbps"`
}

func minimum(first int, second int) int {
	if first < second {
		return first
	}
	return second
}

func floorPowerOfTwo(value int) int {
	result := 1
	for result <= value/2 {
		result *= 2
	}
	return result
}

func sizingProfile(capacity int) (string, time.Duration, time.Duration) {
	switch {
	case capacity <= 1024:
		return "compact", 15 * time.Second, 5 * time.Minute
	case capacity <= 2048:
		return "small", 20 * time.Second, 7 * time.Minute
	case capacity <= 4096:
		return "standard", 30 * time.Second, 10 * time.Minute
	case capacity <= 8192:
		return "performance", 45 * time.Second, 15 * time.Minute
	default:
		return "high-capacity", 60 * time.Second, 20 * time.Minute
	}
}

func recommendedBandwidth(profile string) int {
	switch profile {
	case "compact":
		return 50
	case "small":
		return 100
	case "standard":
		return 250
	case "performance":
		return 500
	default:
		return 1000
	}
}

func calculateAutomaticSizing(cpuCount int, memoryMiB int) SizingMetadata {
	if cpuCount < 1 {
		cpuCount = 1
	}
	if memoryMiB < 1 {
		memoryMiB = 1
	}
	budget := minimum(cpuCount*2048, memoryMiB*3)
	if budget < minimumAutomaticConnections {
		budget = minimumAutomaticConnections
	}
	if budget > maximumAutomaticConnections {
		budget = maximumAutomaticConnections
	}
	capacity := floorPowerOfTwo(budget)
	profile, minimumIdle, maximumIdle := sizingProfile(capacity)
	return SizingMetadata{
		Mode:                     "auto",
		Profile:                  profile,
		CPUCount:                 cpuCount,
		MemoryMiB:                memoryMiB,
		MaximumConnections:       capacity,
		MinimumIdleSeconds:       int(minimumIdle.Seconds()),
		MaximumIdleSeconds:       int(maximumIdle.Seconds()),
		RecommendedBandwidthMbps: recommendedBandwidth(profile),
	}
}

func readMemoryMiB() int {
	memoryMiB := 1
	content, err := os.ReadFile("/proc/meminfo")
	if err == nil {
		for _, line := range strings.Split(string(content), "\n") {
			fields := strings.Fields(line)
			if len(fields) >= 2 && fields[0] == "MemTotal:" {
				value, parseError := strconv.Atoi(fields[1])
				if parseError == nil {
					memoryMiB = value / 1024
				}
				break
			}
		}
	}
	if content, err := os.ReadFile("/sys/fs/cgroup/memory.max"); err == nil {
		value := strings.TrimSpace(string(content))
		if value != "" && value != "max" {
			if bytes, parseError := strconv.ParseInt(value, 10, 64); parseError == nil && bytes > 0 {
				memoryMiB = minimum(memoryMiB, int(bytes/1024/1024))
			}
		}
	}
	return memoryMiB
}

func detectAutomaticSizing() SizingMetadata {
	return calculateAutomaticSizing(runtime.GOMAXPROCS(0), readMemoryMiB())
}

func resolveConnectionSizing(value string, automatic SizingMetadata) (SizingMetadata, error) {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	if trimmed == "" || trimmed == "auto" {
		return automatic, nil
	}
	capacity, err := strconv.Atoi(trimmed)
	if err != nil || capacity < 64 || capacity > maximumManualConnections {
		return SizingMetadata{}, fmt.Errorf("MAX_CONNECTIONS must be auto or an integer between 64 and %d", maximumManualConnections)
	}
	resolved := automatic
	resolved.Mode = "manual"
	resolved.MaximumConnections = capacity
	return resolved, nil
}

func resolveAutomaticDuration(value string, fallback time.Duration) (time.Duration, error) {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	if trimmed == "" || trimmed == "auto" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(trimmed)
	if err != nil {
		return 0, err
	}
	return parsed, nil
}
