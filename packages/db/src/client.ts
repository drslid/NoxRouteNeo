import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

function poolSize() {
  const fallback = process.env.NODE_ENV === "production" ? 5 : 3;
  const configured = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  if (!Number.isFinite(configured)) {
    return fallback;
  }
  return Math.min(20, Math.max(1, configured));
}

const globalDatabase = globalThis as unknown as {
  noxrouteSql?: ReturnType<typeof postgres>;
};

export const sql =
  globalDatabase.noxrouteSql ??
  postgres(databaseUrl, {
    max: poolSize(),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.noxrouteSql = sql;
}

export const db = drizzle(sql, { schema });
