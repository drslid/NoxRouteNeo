import type { RuntimeCommandType } from "@noxroute/contracts";
import { db, runtimeCommands } from "@noxroute/db";

export async function enqueueRuntimeCommand({
  type,
  payload,
  requestedByUserId,
}: {
  type: RuntimeCommandType;
  payload: Record<string, unknown>;
  requestedByUserId: string;
}) {
  const [command] = await db
    .insert(runtimeCommands)
    .values({
      type,
      payload,
      requestedByUserId,
      idempotencyKey: crypto.randomUUID(),
    })
    .returning({ id: runtimeCommands.id });

  return command;
}
