# Install NoxRouteNeo on Ubuntu or Debian

This guide describes the current single-VPS Docker installer.

## Before you start

Prepare:

- an Ubuntu LTS or Debian VPS with public IPv4;
- `root` access or a user with `sudo`;
- at least 1 GiB RAM, an 8 GiB disk and 4 GiB free before installation;
- one DuckDNS subdomain;
- the DuckDNS account token;
- TCP ports `80`, `443` and `8443` open in both the provider firewall and the OS firewall.

Port `443` is reserved for Xray. The web portal uses HTTPS on `8443`.
Both services use the same DuckDNS hostname.

A 12 GiB or larger disk is recommended to leave room for system updates,
backups and future NoxRouteNeo images after installation.

Creating the VPS, creating the DuckDNS name and opening the provider firewall are the only required manual preparation. A provider-independent installer cannot modify an arbitrary hosting provider's firewall.

## One-command installation

Copy and paste this line on a fresh VPS:

```bash
sudo apt-get update && sudo apt-get install -y curl ca-certificates git && sudo curl -fsSL https://raw.githubusercontent.com/drslid/NoxRouteNeo/main/install.sh -o /tmp/noxrouteneo-install.sh && sudo bash /tmp/noxrouteneo-install.sh
```

The first prompt selects the instance language:

```text
1 English       6 العربية
2 Español       7 Русский
3 Français      8 Português
4 Deutsch       9 हिन्दी
5 简体中文     10 اردو
```

The selected language applies to all admin and user accounts and can later be changed in `Settings`.

The installer then asks for the existing DuckDNS subdomain and its token. You may enter either `example` or `example.duckdns.org`. The token is entered without terminal echo. Pressing Enter on the language prompt selects English.

The bootstrap downloads the repository into `/opt/noxrouteneo/source`. If a completed installation already exists, it does not overwrite it and runs the strict diagnostic instead. If the first build stopped before creating containers or initializing PostgreSQL, running the same command updates the checkout, removes only the empty generated state and resumes. The bootstrap stops for manual recovery instead of deleting detected data.

## Unattended installation

```bash
sudo env \
  NOXROUTE_NONINTERACTIVE=1 \
  APP_LOCALE=en \
  DUCKDNS_DOMAIN=example.duckdns.org \
  DUCKDNS_TOKEN='replace-with-token' \
  OWNER_USERNAME=owner \
  OWNER_NAME='Primary Owner' \
  OWNER_PASSWORD='replace-with-a-long-random-password' \
  SERVER_BANDWIDTH_MBIT=100 \
  ./scripts/install.sh
```

Supported `APP_LOCALE` values are `en`, `es`, `fr`, `de`, `zh-CN`, `ar`, `ru`, `pt`, `hi` and `ur`.

Advanced deployments may still define different `ADMIN_DOMAIN` and `VPN_DOMAIN` values, and may provide an optional `LETSENCRYPT_EMAIL`. Those variables are unnecessary for the normal single-domain installation.

Do not save real deployment values in a committed script, shell history, CI log or public issue.

## Automated steps

The installer:

1. installs the small download prerequisites and checks out the source;
2. verifies Ubuntu or Debian, `amd64` or `arm64`, elevated privileges and free disk;
3. installs Docker Engine and the Compose plugin when missing;
4. checks required utilities and public ports;
5. adds TCP `80`, `443` and `8443` rules when UFW is active;
6. detects the public IPv4 address;
7. updates DuckDNS and waits for DNS convergence;
8. creates application secrets with mode `0600`;
9. creates persistent directories under `/opt/noxrouteneo`;
10. adds build swap on a very small VPS when required;
11. builds and starts PostgreSQL, Next.js, Caddy, the Runtime Agent and Traffic Gateway;
12. runs Drizzle migrations;
13. creates and locks the initial owner bootstrap;
14. stores the DuckDNS token encrypted;
15. generates REALITY keys and obtains the Let's Encrypt certificate;
16. runs a strict local verification covering Docker, DNS, listeners, HTTPS, Xray, PostgreSQL and the Traffic Gateway.

The installer is designed to fail before changing runtime configuration when domains, ports or required input are invalid.

## First sign-in

The final output contains the admin URL, VPN endpoint, owner username and one-time temporary password.

1. Open `https://YOUR_DOMAIN.duckdns.org:8443`.
2. Sign in as `owner`.
3. Change the generated password in `Security`.
4. Enable TOTP and store recovery codes outside the VPS.
5. Review the language and default user limits in `Settings`.
6. Create a VPN user.
7. Sign in as that user, register one device and import its subscription QR code.

## Verification

```bash
cd /opt/noxrouteneo/source
sudo docker compose ps
sudo ./scripts/doctor.sh --strict
curl https://YOUR_DOMAIN.duckdns.org:8443/api/health
```

Expected public health response:

```json
{ "status": "ready", "database": "ready", "runtime": "ready" }
```

The health endpoint never returns the DuckDNS token, REALITY private key, passwords or encryption keys.

## Persistent data

| Path                             | Content                                                 |
| -------------------------------- | ------------------------------------------------------- |
| `/opt/noxrouteneo/source/.env`   | Compose secrets and instance configuration; mode `0600` |
| `/opt/noxrouteneo/data/postgres` | PostgreSQL data                                         |
| `/opt/noxrouteneo/data/caddy`    | Let's Encrypt account and certificates                  |
| `/opt/noxrouteneo/backups`       | Local backups                                           |

Back up PostgreSQL together with the application encryption key. An encrypted database without that key cannot recover application secrets.

## Troubleshooting

Run the diagnostic helper first:

```bash
sudo ./scripts/doctor.sh
sudo docker compose logs --tail=200 web runtime traffic-gateway caddy db
```

| Symptom                             | Likely cause                       | Action                                                               |
| ----------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| DuckDNS does not converge           | Wrong domain or token              | Verify the domain name and the account token                         |
| Let's Encrypt fails                 | TCP `80` blocked                   | Open the port and retry on a clean instance                          |
| Xray does not start                 | TCP `443` already used             | Stop the conflicting service                                         |
| Web portal is unreachable           | TCP `8443` blocked                 | Open the provider and OS firewall rules                              |
| Gateway is `bypassed`               | Gateway restarting or unavailable  | Inspect gateway logs; direct fallback keeps connectivity             |
| `Rejected` increases                | Flow capacity reached              | Check CPU, memory, file limits and benchmark before raising capacity |
| Client imports but does not connect | Client lacks current XHTTP support | Use a recent compatible Xray client                                  |

## Uninstall

```bash
sudo NOXROUTENEO_CONFIRM_UNINSTALL=DELETE ./scripts/uninstall.sh
```

This removes NoxRouteNeo containers, local images, data, certificates, secrets, backups and the NoxRouteNeo swap file. It does not remove Docker Engine.
