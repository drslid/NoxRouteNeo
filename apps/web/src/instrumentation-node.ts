import path from "node:path";

export async function runDatabaseMigrations() {
  if (process.env.RUN_DB_MIGRATIONS === "false") {
    return;
  }

  const [{ db }, { migrate }] = await Promise.all([
    import("@noxroute/db"),
    import("drizzle-orm/postgres-js/migrator"),
  ]);
  const localMigrations = process.cwd().endsWith("/apps/web")
    ? path.resolve(process.cwd(), "../../packages/db/drizzle")
    : path.resolve(process.cwd(), "packages/db/drizzle");
  const migrationsFolder =
    process.env.DRIZZLE_MIGRATIONS_PATH ?? localMigrations;

  await migrate(db, {
    migrationsFolder,
    migrationsSchema: "public",
    migrationsTable: "__drizzle_migrations",
  });
  console.info("Database migrations are current.");
}
