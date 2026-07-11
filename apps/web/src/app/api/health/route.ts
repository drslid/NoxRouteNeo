import { db, runtimeAgentState, sql } from "@noxroute/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`select 1`;
    const [runtime] = await db
      .select({ status: runtimeAgentState.status })
      .from(runtimeAgentState)
      .limit(1);
    return Response.json(
      {
        status: "ready",
        database: "ready",
        runtime: runtime?.status ?? "starting",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
