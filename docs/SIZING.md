# NoxRouteNeo VPS Sizing Guide

This page gives conservative first sizing recommendations for a local NoxRouteNeo VPS.

The important unit is not registered users. The important unit is simultaneous VPN traffic:

- active devices connected at the same time;
- total Mbps crossing Xray;
- average mobile usage profile;
- CPU generation and single-core performance;
- VPS network cap.

## Current POC Baseline

The AWS POC runs on a very small ARM VPS:

| Resource | Current POC |
| --- | --- |
| CPU | 2 vCPU ARM Neoverse-N1 |
| RAM | about 1 GB |
| Swap | about 1.4 GB, created for the Next.js build |
| Xray memory observed | about 10 MB idle, about 55 MB during traffic |
| Xray CPU observed | about 25-30% during real mobile traffic bursts |
| Stack memory headroom | tight but usable for POC |

Docker `CPU %` is a live container metric. On multi-core hosts it can go above 100%; roughly, 100% means one full CPU core worth of work. So 25-30% on the POC means a visible but acceptable CPU burst on a very small 2 vCPU VPS.

## Practical Recommendation

Use this table for the first public documentation. It is intentionally conservative.

| Scenario | Active mobile devices | Approx sustained VPN traffic | Recommended VPS |
| --- | ---: | ---: | --- |
| Test only | 1-2 | 1-20 Mbps | 1 vCPU / 1 GB RAM |
| Small personal | 2-5 | 20-80 Mbps | 2 vCPU / 2 GB RAM |
| Family / small group | 5-15 | 80-250 Mbps | 2-4 vCPU / 4 GB RAM |
| Small community | 15-40 | 250-600 Mbps | 4 vCPU / 8 GB RAM |
| Heavier usage | 40-100 | 600 Mbps-1.5 Gbps | 8 vCPU / 16 GB RAM |
| More than 100 active devices | 1.5 Gbps+ | Benchmark first; split across multiple VPS |

Registered users can be much higher than active devices. For example, 100 registered users with only 5-10 active at the same time can run on a small VPS. Ten users streaming/downloading at the same time can require more CPU and bandwidth than 100 mostly idle users.

## User Count Rule Of Thumb

For mobile-first usage:

| Registered users | Expected active devices | Suggested starting VPS |
| ---: | ---: | --- |
| 1-5 | 1-2 | 1 vCPU / 1 GB RAM |
| 5-20 | 2-5 | 2 vCPU / 2 GB RAM |
| 20-50 | 5-15 | 2-4 vCPU / 4 GB RAM |
| 50-150 | 15-40 | 4 vCPU / 8 GB RAM |
| 150+ | 40+ | 8 vCPU / 16 GB RAM or multi-VPS |

## Minimum For Public Install

Recommended minimum for users installing from Git:

- 2 vCPU;
- 2 GB RAM;
- 20 GB disk;
- 1 Gbps network port if available;
- Ubuntu/Debian;
- ports `80`, `443`, `8443`;
- optional 1-2 GB swap on small VPS.

Absolute minimum for tests:

- 1 vCPU;
- 1 GB RAM;
- low number of users;
- no heavy streaming/download expectation.

## Why Not Size Only By Users?

One active phone can open many TCP connections and generate bursts. The real limits are:

- total Mbps encrypted by Xray;
- concurrent TCP flows;
- CPU available for XHTTP + REALITY;
- memory headroom for the app, Caddy, Xray, PostgreSQL and OS cache;
- provider bandwidth policy.

## How To Tune The App

Use these controls:

- user `speed_limit_mbps`: per-user policy;
- `max_devices`: maximum number of device configs a user can create;
- `Server bandwidth guard`: percentage of server bandwidth reserved for VPN traffic.

The Go Traffic Gateway enforces the per-user TCP token bucket and the global
bandwidth guard. The Runtime Agent persists Xray byte counters and active
sessions. UDP enforcement still requires a separate validation before it is
documented as a guaranteed limit.

## Traffic Gateway Capacity

The default technical ceiling is 4096 concurrent TCP flows. This is a safety
limit, not a sizing promise for 4096 active users. Xray encryption, destination
sockets, kernel buffers and provider bandwidth usually become limiting first.
Sockets with no transferred bytes for 10 minutes are closed automatically.
The admin dashboard reports active flows, rejected admissions, saturation
shedding and idle timeouts; sustained non-zero rejected admissions indicate
that the VPS or the configured gateway capacity must be reviewed.

The current implementation was validated with:

- 1000 simultaneous authenticated SOCKS flows in the Go integration test;
- 100 parallel mobile-style HTTPS navigations through VLESS + XHTTP + REALITY;
- a new navigation immediately after the peak;
- native Xray fallback to direct output while the gateway was stopped;
- no Xray restart during fallback and recovery;
- a sustained 10 Mbps policy measured at 10.39 Mbps over 10 MB.

On the 1 GB AWS ARM POC at idle, the Traffic Gateway used about 6 MB RAM and
the combined Python Runtime Agent plus Xray container used about 48 MB. These
figures are a baseline, not a substitute for the release benchmark below.

## When To Upgrade

Upgrade the VPS when one of these is true for more than a few minutes:

- Xray CPU stays above 70%;
- system CPU load is high while traffic is active;
- available RAM stays below 200 MB;
- swap is used continuously;
- users report unstable VPN during normal traffic;
- provider network throughput is reached.

## Required Benchmark Before Final Release

Before publishing a stable sizing chart, run a reproducible benchmark:

1. Start NoxRouteNeo on a known VPS size.
2. Generate Xray clients for 1, 5, 10, 25 and 50 active devices.
3. Run controlled download/upload tests at 10, 50, 100, 250 and 500 Mbps.
4. Record Xray CPU, memory, latency, packet loss and throughput.
5. Repeat on at least ARM and x86 VPS types.

## References

- Docker stats command: https://docs.docker.com/reference/cli/docker/container/stats/
- AWS T4g instance family: https://aws.amazon.com/ec2/instance-types/t4/
