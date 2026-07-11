import { desc, eq } from "drizzle-orm";
import { db, session as sessionTable } from "@noxroute/db";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@noxroute/ui";

import { SecurityControls } from "./security-controls";
import { intlLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/server";

export async function SecurityPageContent({
  userId,
  twoFactorEnabled,
}: {
  userId: string;
  twoFactorEnabled: boolean;
}) {
  const { locale, t } = await getTranslations();
  const numberLocale = intlLocale(locale);
  const sessions = await db
    .select({
      id: sessionTable.id,
      createdAt: sessionTable.createdAt,
      expiresAt: sessionTable.expiresAt,
      userAgent: sessionTable.userAgent,
    })
    .from(sessionTable)
    .where(eq(sessionTable.userId, userId))
    .orderBy(desc(sessionTable.createdAt));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase text-emerald-700">
          {t("security.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{t("nav.security")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("security.sessionsExpire")}
        </p>
      </header>
      <SecurityControls twoFactorEnabled={twoFactorEnabled} />
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("security.activeSessions")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {sessions.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between gap-2 px-5 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {item.userAgent ?? t("security.unknownBrowser")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("security.sessionDates", {
                    created: item.createdAt.toLocaleString(numberLocale),
                    expires: item.expiresAt.toLocaleTimeString(numberLocale),
                  })}
                </p>
              </div>
              <Badge variant="success">{t("common.active")}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
