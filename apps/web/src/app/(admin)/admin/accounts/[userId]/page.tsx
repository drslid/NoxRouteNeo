import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@noxroute/ui";
import { notFound } from "next/navigation";

import { AccountSettingsForm } from "@/components/accounts/account-settings-form";
import { ResetAccountPasswordForm } from "@/components/accounts/reset-account-password-form";
import { getAccount } from "@/data/accounts";
import {
  calculateRemainingDays,
  formatBytes,
  formatDate,
  formatDuration,
} from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { intlLocale } from "@/i18n/config";
import { roleMessageKey, statusMessageKey } from "@/i18n/labels";
import { getTranslations } from "@/i18n/server";

export const metadata: Metadata = { title: "Account details" };
export const dynamic = "force-dynamic";

export default async function AccountDetailsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { locale, t } = await getTranslations();
  const numberLocale = intlLocale(locale);
  const { session, role } = await requireAdmin();
  const account = await getAccount(userId);
  if (!account) {
    notFound();
  }

  const remainingDays = calculateRemainingDays(account.expiresAt);
  const quotaGigabytes = account.quotaBytes
    ? Number(account.quotaBytes) / 1024 / 1024 / 1024
    : null;
  const isVpnUser = account.role === "user";
  const canResetPassword =
    account.id !== session.user.id &&
    (role === "owner" || account.role === "user");

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase text-emerald-700">
            {t("accounts.account")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{account.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
            @{account.username}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{t(roleMessageKey(account.role))}</Badge>
          <Badge variant={account.banned ? "warning" : "success"}>
            {t(
              statusMessageKey(
                account.banned
                  ? "suspended"
                  : (account.accessStatus ?? "active"),
              ),
            )}
          </Badge>
        </div>
      </header>

      {isVpnUser && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              t("common.transfer"),
              formatBytes(account.usedBytes, numberLocale),
            ],
            [
              t("common.quota"),
              account.quotaBytes
                ? formatBytes(account.quotaBytes, numberLocale)
                : t("common.unlimited"),
            ],
            [
              t("accounts.connectionTime"),
              formatDuration(account.connectedSeconds, numberLocale),
            ],
            [
              t("accounts.expires"),
              formatDate(
                account.expiresAt,
                numberLocale,
                t("common.unlimited"),
              ),
            ],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-lg font-semibold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>
            {isVpnUser ? t("accounts.policy") : t("accounts.adminSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <AccountSettingsForm
            userId={account.id}
            isVpnUser={isVpnUser}
            initialValues={{
              displayName: account.name,
              status: account.banned ? "suspended" : "active",
              maxDevices: account.maxDevices ?? 2,
              maxDays: remainingDays,
              maxGigabytes: quotaGigabytes,
              speedLimitMbps: account.speedLimitMbps ?? 0,
            }}
          />
        </CardContent>
      </Card>

      {canResetPassword && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("accounts.resetPassword")}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <ResetAccountPasswordForm userId={account.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
