import { auth } from "@noxroute/auth/server";
import {
  appLocaleSchema,
  passwordSchema,
  usernameSchema,
} from "@noxroute/contracts";
import {
  account,
  auditLogs,
  db,
  instanceSettings,
  session,
  sql,
  user,
} from "@noxroute/db";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

async function bootstrapOwner() {
  const username = usernameSchema.parse(process.env.OWNER_USERNAME ?? "owner");
  const password = passwordSchema.parse(process.env.OWNER_PASSWORD);
  const displayName = (process.env.OWNER_NAME ?? "Primary Owner").trim();
  const resetPassword = process.env.OWNER_RESET_PASSWORD === "true";
  const appLocale = appLocaleSchema.parse(process.env.APP_LOCALE ?? "en");

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);

  if (existing) {
    if (resetPassword) {
      const hashedPassword = await hashPassword(password);
      const updatedAccounts = await db
        .update(account)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(
          and(
            eq(account.userId, existing.id),
            eq(account.providerId, "credential"),
          ),
        )
        .returning({ id: account.id });

      if (updatedAccounts.length !== 1) {
        throw new Error("Owner credential account is missing or duplicated");
      }

      await db.delete(session).where(eq(session.userId, existing.id));
      await db.insert(auditLogs).values({
        actorUserId: existing.id,
        action: "owner.password_reset",
        resourceType: "user",
        resourceId: existing.id,
        result: "success",
        metadata: { username, sessionsRevoked: true },
      });

      console.log(
        `Owner @${username} password reset. Existing sessions were revoked.`,
      );
      return;
    }

    console.log(`Owner @${username} already exists.`);
    return;
  }

  const result = await auth.api.createUser({
    body: {
      name: displayName,
      email: `${crypto.randomUUID()}@noxroute.invalid`,
      password,
      role: "owner",
      data: {
        username,
        displayUsername: username,
      },
    },
  });

  await db
    .update(user)
    .set({
      username,
      displayUsername: username,
      role: "owner",
      emailVerified: true,
      updatedAt: new Date(),
    })
    .where(eq(user.id, result.user.id));

  await db
    .insert(instanceSettings)
    .values({ id: "default", appLocale })
    .onConflictDoUpdate({
      target: instanceSettings.id,
      set: { appLocale, updatedAt: new Date() },
    });

  await db.insert(auditLogs).values({
    actorUserId: result.user.id,
    action: "owner.bootstrap",
    resourceType: "user",
    resourceId: result.user.id,
    result: "success",
    metadata: { username },
  });

  console.log(`Owner @${username} created. The password was not logged.`);
}

bootstrapOwner()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown bootstrap error";
    console.error(`Owner bootstrap failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
