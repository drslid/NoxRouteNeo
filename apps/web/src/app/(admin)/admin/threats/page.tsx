import type { Metadata } from "next";
import { count, desc, ilike, or, sql } from "drizzle-orm";
import { db, ipBans, securityEvents } from "@noxroute/db";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@noxroute/ui";
import { ExternalLink } from "lucide-react";

import {
  DataTableQueryControls,
  TablePagination,
} from "@/components/data-table-query-controls";
import {
  CreateIpBanForm,
  IpBanActions,
} from "@/components/security/ip-ban-controls";
import { intlLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/server";
import { getRuntimeSecurity } from "@/lib/runtime-health";

export const metadata: Metadata = { title: "Threat protection" };
export const dynamic = "force-dynamic";

function requestedPage(value: string | undefined, totalPages: number) {
  const parsed = Number(value);
  return Math.min(
    totalPages,
    Number.isInteger(parsed) && parsed > 0 ? parsed : 1,
  );
}

export default async function ThreatsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    pageSize?: string;
    banPage?: string;
    eventPage?: string;
  }>;
}) {
  const { locale, t } = await getTranslations();
  const numberLocale = intlLocale(locale);
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100) ?? "";
  const requestedSize = Number(params.pageSize);
  const pageSize = [25, 50, 100].includes(requestedSize) ? requestedSize : 25;
  const banFilter = query
    ? or(
        ilike(ipBans.ipAddress, `%${query}%`),
        ilike(ipBans.reason, `%${query}%`),
        ilike(ipBans.source, `%${query}%`),
      )
    : undefined;
  const eventFilter = query
    ? or(
        ilike(securityEvents.ipAddress, `%${query}%`),
        ilike(securityEvents.kind, `%${query}%`),
        ilike(securityEvents.outcome, `%${query}%`),
        ilike(securityEvents.route, `%${query}%`),
      )
    : undefined;
  const [summary] = await db
    .select({
      activeBans: sql<number>`count(*) filter (where ${ipBans.releasedAt} is null and (${ipBans.permanent} = true or ${ipBans.expiresAt} > now()))::int`,
      permanentBans: sql<number>`count(*) filter (where ${ipBans.releasedAt} is null and ${ipBans.permanent} = true)::int`,
    })
    .from(ipBans);
  const [eventSummary] = await db
    .select({
      rejected: sql<number>`count(*) filter (where ${securityEvents.outcome} = 'rejected')::int`,
      allowed: sql<number>`count(*) filter (where ${securityEvents.outcome} = 'allowed')::int`,
    })
    .from(securityEvents)
    .where(sql`${securityEvents.createdAt} >= now() - interval '24 hours'`);
  const firewall = await getRuntimeSecurity();

  const [banTotalRow, eventTotalRow] = await Promise.all([
    db.select({ value: count() }).from(ipBans).where(banFilter),
    db.select({ value: count() }).from(securityEvents).where(eventFilter),
  ]);
  const banTotal = Number(banTotalRow[0]?.value ?? 0);
  const eventTotal = Number(eventTotalRow[0]?.value ?? 0);
  const banPages = Math.max(1, Math.ceil(banTotal / pageSize));
  const eventPages = Math.max(1, Math.ceil(eventTotal / pageSize));
  const banPage = requestedPage(params.banPage, banPages);
  const eventPage = requestedPage(params.eventPage, eventPages);

  const [bans, events] = await Promise.all([
    db
      .select({
        id: ipBans.id,
        ipAddress: ipBans.ipAddress,
        source: ipBans.source,
        reason: ipBans.reason,
        permanent: ipBans.permanent,
        expiresAt: ipBans.expiresAt,
        occurrenceCount: ipBans.occurrenceCount,
        lastSeenAt: ipBans.lastSeenAt,
        releasedAt: ipBans.releasedAt,
        active: sql<boolean>`${ipBans.releasedAt} is null and (${ipBans.permanent} = true or ${ipBans.expiresAt} > now())`,
      })
      .from(ipBans)
      .where(banFilter)
      .orderBy(desc(ipBans.updatedAt))
      .limit(pageSize)
      .offset((banPage - 1) * pageSize),
    db
      .select()
      .from(securityEvents)
      .where(eventFilter)
      .orderBy(desc(securityEvents.createdAt))
      .limit(pageSize)
      .offset((eventPage - 1) * pageSize),
  ]);
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase text-emerald-700">
          {t("threats.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{t("nav.threats")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("threats.description")}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          title={t("threats.activeBans")}
          value={summary?.activeBans ?? 0}
        />
        <Metric
          title={t("threats.permanentBans")}
          value={summary?.permanentBans ?? 0}
        />
        <Metric
          title={t("threats.rejected24h")}
          value={eventSummary?.rejected ?? 0}
        />
        <Metric
          title={t("threats.allowedSignIns24h")}
          value={eventSummary?.allowed ?? 0}
        />
        <Metric
          title={t("threats.firewall")}
          value={
            firewall?.status === "ready"
              ? t("common.ready")
              : t("common.unavailable")
          }
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>{t("threats.manualBlock")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("threats.manualBlockHelp")}
          </p>
        </CardHeader>
        <CreateIpBanForm />
        <DataTableQueryControls
          key={query}
          query={query}
          pageSize={pageSize}
          placeholder={t("threats.searchPlaceholder")}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("threats.ipAddress")}</TableHead>
              <TableHead>{t("threats.reason")}</TableHead>
              <TableHead>{t("threats.attempts")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("threats.lastSeen")}</TableHead>
              <TableHead className="text-right">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bans.length ? (
              bans.map((ban) => {
                const active = ban.active;
                return (
                  <TableRow key={ban.id}>
                    <TableCell>
                      <a
                        className="inline-flex items-center gap-1 font-mono text-xs font-medium text-emerald-700 hover:underline"
                        href={`https://tools.keycdn.com/geo?host=${encodeURIComponent(ban.ipAddress)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {ban.ipAddress}
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="block truncate">{ban.reason}</span>
                      <span className="text-xs text-muted-foreground">
                        {ban.source}
                      </span>
                    </TableCell>
                    <TableCell>
                      {ban.occurrenceCount.toLocaleString(numberLocale)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          active
                            ? ban.permanent
                              ? "warning"
                              : "success"
                            : "outline"
                        }
                      >
                        {ban.releasedAt
                          ? t("threats.released")
                          : ban.permanent
                            ? t("threats.permanent")
                            : active
                              ? t("threats.until", {
                                  time: ban.expiresAt!.toLocaleString(
                                    numberLocale,
                                  ),
                                })
                              : t("threats.expired")}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {ban.lastSeenAt.toLocaleString(numberLocale)}
                    </TableCell>
                    <TableCell className="text-right">
                      <IpBanActions
                        banId={ban.id}
                        active={active}
                        permanent={ban.permanent}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-28 text-center text-muted-foreground"
                >
                  {t("threats.noBans")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          page={banPage}
          totalPages={banPages}
          totalItems={banTotal}
          pageParameter="banPage"
        />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>{t("threats.recentEvents")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("threats.retentionHelp")}
          </p>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("audit.time")}</TableHead>
              <TableHead>{t("threats.ipAddress")}</TableHead>
              <TableHead>{t("threats.event")}</TableHead>
              <TableHead>{t("audit.result")}</TableHead>
              <TableHead>{t("threats.route")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length ? (
              events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {event.createdAt.toLocaleString(numberLocale)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {event.ipAddress}
                  </TableCell>
                  <TableCell className="font-medium">
                    {event.kind.replaceAll("_", " ")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        event.outcome === "allowed" ? "success" : "warning"
                      }
                    >
                      {event.outcome}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {event.route ?? "-"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-28 text-center text-muted-foreground"
                >
                  {t("threats.noEvents")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          page={eventPage}
          totalPages={eventPages}
          totalItems={eventTotal}
          pageParameter="eventPage"
        />
      </Card>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-semibold">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </CardContent>
    </Card>
  );
}
