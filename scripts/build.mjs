import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const environment = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://build:build@127.0.0.1:5432/noxroute_build",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    "build-only-secret-with-at-least-thirty-two-characters",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  APP_ENCRYPTION_KEY:
    process.env.APP_ENCRYPTION_KEY ??
    "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  RUN_DB_MIGRATIONS: "false",
};

const child = spawn(command, ["exec", "turbo", "build"], {
  env: environment,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
