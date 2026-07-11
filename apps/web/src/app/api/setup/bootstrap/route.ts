import { auth } from "@noxroute/auth/server";
import { setupBootstrapSchema } from "@noxroute/contracts";
import {
  auditLogs,
  db,
  encryptedSecrets,
  instanceSettings,
  runtimeCommands,
  user,
} from "@noxroute/db";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { ApiError, apiErrorResponse } from "@/lib/api-auth";
import { encryptSecret } from "@/lib/secrets";

function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[:/].*$/, "");
}

function validSetupToken(received: string | null) {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || !received) {
    return false;
  }
  const expectedDigest = createHash("sha256").update(expected).digest();
  const receivedDigest = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedDigest, receivedDigest);
}

export async function POST(request: NextRequest) {
  try {
    if (!validSetupToken(request.headers.get("x-setup-token"))) {
      throw new ApiError(401, "Setup authorization failed");
    }

    const input = setupBootstrapSchema.parse(await request.json());
    const [[settings], [existingOwner]] = await Promise.all([
      db
        .select({ setupLockedAt: instanceSettings.setupLockedAt })
        .from(instanceSettings)
        .where(eq(instanceSettings.id, "default"))
        .limit(1),
      db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.role, "owner"))
        .limit(1),
    ]);
    if (settings?.setupLockedAt || existingOwner) {
      throw new ApiError(409, "Initial setup is already locked");
    }

    const created = await auth.api.createUser({
      body: {
        name: input.ownerName,
        email: `${crypto.randomUUID()}@noxroute.invalid`,
        password: input.ownerPassword,
        role: "owner",
        data: {
          username: input.ownerUsername,
          displayUsername: input.ownerUsername,
        },
      },
    });
    const adminDomain = normalizeDomain(input.adminDomain);
    const vpnDomain = normalizeDomain(input.vpnDomain);

    await db.transaction(async (tx) => {
      await tx
        .update(user)
        .set({
          username: input.ownerUsername,
          displayUsername: input.ownerUsername,
          role: "owner",
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(user.id, created.user.id));

      await tx
        .insert(instanceSettings)
        .values({
          id: "default",
          configured: true,
          appLocale: input.appLocale,
          adminDomain,
          vpnDomain,
          adminHttpsPort: input.adminHttpsPort,
          vpnPort: 443,
          setupLockedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: instanceSettings.id,
          set: {
            configured: true,
            appLocale: input.appLocale,
            adminDomain,
            vpnDomain,
            adminHttpsPort: input.adminHttpsPort,
            vpnPort: 443,
            setupLockedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      if (input.duckdnsToken) {
        const encrypted = encryptSecret(input.duckdnsToken);
        await tx.insert(encryptedSecrets).values({
          kind: "duckdns_token",
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
        });
      }

      await tx.insert(runtimeCommands).values([
        {
          type: "FINALIZE_SETUP",
          payload: { reason: "initial_setup" },
          idempotencyKey: crypto.randomUUID(),
          requestedByUserId: created.user.id,
        },
        {
          type: "UPDATE_DUCKDNS",
          payload: { reason: "initial_setup" },
          idempotencyKey: crypto.randomUUID(),
          requestedByUserId: created.user.id,
        },
      ]);
      await tx.insert(auditLogs).values({
        actorUserId: created.user.id,
        action: "instance.bootstrap",
        resourceType: "instance",
        resourceId: "default",
        result: "success",
        metadata: {
          adminDomain,
          vpnDomain,
          vpnPort: 443,
          appLocale: input.appLocale,
        },
      });
    });

    return Response.json(
      { success: true, adminDomain, vpnDomain },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
