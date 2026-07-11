import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { auditLogs, db } from "@noxroute/db";
import {
  Badge,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@noxroute/ui";

import { intlLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/server";

export const metadata: Metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const { locale, t } = await getTranslations();
  const numberLocale = intlLocale(locale);
  const events = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(250);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase text-emerald-700">
          {t("audit.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{t("nav.audit")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("audit.description")}
        </p>
      </header>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audit.time")}</TableHead>
                <TableHead>{t("audit.action")}</TableHead>
                <TableHead>{t("audit.resource")}</TableHead>
                <TableHead>{t("audit.result")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length > 0 ? (
                events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {event.createdAt.toLocaleString(numberLocale)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {event.action}
                    </TableCell>
                    <TableCell>
                      {event.resourceType}
                      {event.resourceId
                        ? ` / ${event.resourceId.slice(0, 12)}`
                        : ""}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          event.result === "success" ? "success" : "warning"
                        }
                      >
                        {event.result === "success"
                          ? t("common.success")
                          : t("common.failed")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {t("audit.noEvents")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
