import type { Metadata } from "next";
import { Button, Card } from "@noxroute/ui";
import { UserPlus } from "lucide-react";
import Link from "next/link";

import { AccountsTable } from "@/components/accounts/accounts-table";
import { SignInAccess } from "@/components/accounts/sign-in-access";
import { listAccounts } from "@/data/accounts";
import { getTranslations } from "@/i18n/server";

export const metadata: Metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const { t } = await getTranslations();
  const accounts = await listAccounts();
  const signInUrl = new URL(
    "/sign-in",
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  ).toString();

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase text-emerald-700">
            {t("accounts.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{t("nav.accounts")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("accounts.description")}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/accounts/new">
            <UserPlus aria-hidden="true" />
            {t("accounts.new")}
          </Link>
        </Button>
      </header>
      <SignInAccess url={signInUrl} />
      <Card className="overflow-hidden">
        <AccountsTable data={accounts} />
      </Card>
    </div>
  );
}
