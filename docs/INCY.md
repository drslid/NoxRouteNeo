# Connect NoxRouteNeo with INCY

NoxRouteNeo publishes one device-bound subscription for every registered device. INCY is the recommended client because it supports subscription URLs, QR imports, XHTTP + REALITY and HWID sharing.

NoxRouteNeo is not affiliated with INCY. Use only the official links below.

## Official downloads

| Platform                              | Official resource                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| iPhone, iPad and Apple Silicon Mac    | [Download from the App Store](https://apps.apple.com/us/app/incy/id6756943388)            |
| Android phone or tablet               | [Download from Google Play](https://play.google.com/store/apps/details?id=llc.itdev.incy) |
| Windows x64/ARM64 and Linux x64/ARM64 | [INCY Desktop releases](https://github.com/INCY-DEV/incy-platforms/releases/latest)       |
| Product website                       | [incy.cc](https://incy.cc/)                                                               |

## Register and connect a device

1. Install a current INCY release from an official link above.
2. Sign in to the NoxRouteNeo user portal.
3. Open `Devices`, select `Register device`, name the device and choose `Fast`, `Balanced` or `Stealth`.
4. In INCY, enable HWID sharing for subscription requests. See the [official HWID guide](https://docs.incy.cc/en/hwid/).
5. Return to NoxRouteNeo and open `Connection`.
6. On the same device, select `Import in INCY`. Alternatively, scan the QR code from INCY or copy and import the subscription URL.
7. Refresh the subscription in INCY. The first valid HWID becomes the owner of that credential.
8. Select the imported endpoint and start the VPN.

Create one NoxRouteNeo device for each phone, tablet or computer. Do not reuse a QR code between devices.

The one-click action uses INCY's documented `incy://import/https://...` deep link. The subscription URL remains stable, and INCY continues to send its HWID when refreshing it.

INCY Desktop `3.3.1` was first published on July 11, 2026. Windows and Linux support must therefore be validated with the current NoxRouteNeo subscription before it is treated as mature. On Windows, start with the x64 release unless the computer uses Windows on ARM.

## Device binding

The first compatible INCY client to refresh a new subscription binds it to its HWID. Later refreshes with the same HWID are accepted; another HWID receives HTTP `403`.

NoxRouteNeo stores an HMAC digest rather than the raw HWID. To move access to a replacement phone, revoke the old NoxRouteNeo device and register a new one.

This prevents ordinary subscription sharing. It is not hardware attestation and cannot protect a credential extracted by a compromised or modified client.

## Latency

NoxRouteNeo sends the INCY subscription preference `sort-order: ping`. INCY measures latency from the current device and network; the server cannot supply a truthful phone latency. With a single NoxRouteNeo endpoint, a latency value may only appear after refreshing the subscription or running INCY's connection test.

## Troubleshooting

| Symptom                                 | Action                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Subscription returns `428`              | Enable HWID sharing in INCY and refresh again.                                      |
| Subscription returns `403`              | The credential belongs to another HWID. Revoke and recreate the NoxRouteNeo device. |
| Import works but the VPN does not start | Update INCY, refresh the subscription and confirm that TCP `443` reaches the VPS.   |
| No latency is displayed                 | Refresh or test the endpoint in INCY; latency is client-side.                       |
| Profile was changed                     | Refresh the subscription, then disconnect and reconnect the VPN.                    |

Administrators can find the same official resources in `Settings`. Users can find them directly above their QR codes in `Connection`.

## Official technical references

- [INCY HWID guide](https://docs.incy.cc/en/hwid/)
- [INCY subscription format](https://docs.incy.cc/en/subscription-format/)
- [INCY official website](https://incy.cc/)
