export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { runDatabaseMigrations } = await import("./instrumentation-node");
  await runDatabaseMigrations();
}
