# Security Policy

## Project status

NoxRouteNeo is currently alpha software. It has not received an independent security audit and should first be evaluated on a test VPS with non-sensitive accounts.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

After the public repository is created, use GitHub's private vulnerability reporting or a private Security Advisory. Include:

- affected version or commit;
- affected component;
- prerequisites and impact;
- reproducible steps or a minimal proof of concept;
- relevant logs with all credentials, domains, IP addresses and tokens removed.

Allow time to reproduce and assess the report before publishing details. There is currently no paid bug bounty.

## Sensitive data

Never include these values in an issue, discussion, screenshot or diagnostic archive:

- `.env` contents;
- DuckDNS token;
- REALITY private key;
- subscription URLs or VLESS UUIDs;
- passwords, TOTP secrets or recovery codes;
- AWS, VPS-provider or SSH credentials;
- PostgreSQL dumps or application backups.

## Deployment baseline

- Use a dedicated, patched Ubuntu or Debian VPS.
- Restrict public inbound traffic to the documented ports.
- Change the generated owner password immediately.
- Enable TOTP for owner and administrator accounts.
- Keep Docker, base images and NoxRouteNeo updated.
- Back up PostgreSQL and the application encryption key securely.
- Review the admin dashboard for gateway bypass, failed runtime commands and unusual usage.
