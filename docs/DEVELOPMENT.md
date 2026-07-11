# Local development

## Requirements

- Node.js 22 or newer;
- Corepack and pnpm;
- Docker Engine with Docker Compose;
- enough memory to build the Next.js application and service images.

## Environment

Create a local `.env` from `.env.example` and replace every development placeholder. Never commit the resulting file.

The development PostgreSQL service binds only to `127.0.0.1:5433`:

```text
postgresql://noxroute:noxroute-local-dev@127.0.0.1:5433/noxrouteneo
```

## First run

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
OWNER_USERNAME=owner \
OWNER_PASSWORD='replace-with-a-long-random-password' \
APP_LOCALE=en \
pnpm bootstrap:owner
pnpm --filter @noxroute/web dev
```

Open `http://localhost:3000`.

## Reset the local owner password

```bash
OWNER_USERNAME=owner \
OWNER_PASSWORD='replace-with-a-new-long-random-password' \
OWNER_RESET_PASSWORD=true \
pnpm bootstrap:owner
```

The command updates only the credential account for that owner, revokes existing sessions and writes an audit event. It never prints the password.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:services
pnpm build
```

Run every check with:

```bash
pnpm check
```

## Isolation

- development PostgreSQL uses loopback port `5433`, not public port `5432`;
- the Next.js container never receives the Docker socket;
- local development commands do not deploy or modify a VPS;
- runtime data, backups, `.env` and internal planning documents are ignored by Git.
