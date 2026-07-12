import type { Metadata } from "next";
import { count, desc, ilike, or, sql } from "drizzle-orm";
import { auditLogs, db, user } from "@noxroute/db";
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
import {
  DataTableQueryControls,
  TablePagination,
} from "@/components/data-table-query-controls";

export const metadata: Metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string }>;
}) {
  const { locale, t } = await getTranslations();
  const numberLocale = intlLocale(locale);
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100) ?? "";
  const requestedSize = Number(params.pageSize);
  const pageSize = [25, 50, 100].includes(requestedSize) ? requestedSize : 25;
  const filter = query
    ? or(
        ilike(auditLogs.action, `%${query}%`),
        ilike(auditLogs.resourceType, `%${query}%`),
        ilike(auditLogs.resourceId, `%${query}%`),
        ilike(auditLogs.result, `%${query}%`),
        ilike(user.username, `%${query}%`),
        sql`${auditLogs.metadata}::text ilike ${`%${query}%`}`,
      )
    : undefined;
  const [totalRow] = await db
    .select({ value: count() })
    .from(auditLogs)
    .leftJoin(user, sql`${auditLogs.actorUserId} = ${user.id}`)
    .where(filter);
  const totalItems = Number(totalRow?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const requestedPage = Number(params.page);
  const page = Math.min(
    totalPages,
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  );
  const events = await db
    .select({
      id: auditLogs.id,
      actorUsername: user.username,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      result: auditLogs.result,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(user, sql`${auditLogs.actorUserId} = ${user.id}`)
    .where(filter)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

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
        <DataTableQueryControls
          key={query}
          query={query}
          pageSize={pageSize}
          placeholder={t("audit.searchPlaceholder")}
        />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audit.time")}</TableHead>
                <TableHead>{t("audit.actor")}</TableHead>
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
                    <TableCell>
                      {event.actorUsername
                        ? `@${event.actorUsername}`
                        : t("common.system")}
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
                    colSpan={5}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {t("audit.noEvents")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <TablePagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
        />
      </Card>
    </div>
  );
}
