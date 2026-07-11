# Contributing

NoxRouteNeo is currently an alpha POC. Keep changes narrowly scoped, reproducible and compatible with the single-VPS Docker architecture.

## Development workflow

1. Create a branch from `main`.
2. Make the smallest coherent change.
3. Add or update tests for changed behavior.
4. Run the full validation suite.
5. Open a pull request that explains behavior, risk and verification.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

## Engineering rules

- Do not commit secrets, runtime data, databases, backups or generated build output.
- Preserve `VLESS + XHTTP + REALITY` as the standard VPN transport.
- Do not add destination logging or browsing history.
- Keep PostgreSQL and internal control APIs private.
- New interface messages must include all ten supported translations.
- Arabic and Urdu changes must be checked in right-to-left layout.
- Network-capacity claims require a reproducible benchmark and documented VPS specification.
- Installation changes must remain idempotent on supported Ubuntu and Debian releases.

## Pull request evidence

Include the commands run, affected services, migration impact and screenshots for visible interface changes. Remove hostnames, IP addresses, usernames, QR codes and tokens from screenshots and logs.
