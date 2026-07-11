"use client";

import { Button } from "@noxroute/ui";
import { Copy, ExternalLink, LogIn } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";

export function SignInAccess({ url }: { url: string }) {
  const { t } = useI18n();
  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    toast.success(t("accounts.signInCopied"));
  }

  return (
    <section className="flex flex-col justify-between gap-3 border-y py-4 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          <LogIn className="size-4 text-emerald-700" aria-hidden="true" />
          {t("accounts.signIn")}
        </p>
        <a
          className="mt-1 block break-all text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          href={url}
          target="_blank"
          rel="noreferrer"
          dir="ltr"
        >
          {url}
        </a>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={t("accounts.copySignIn")}
          title={t("accounts.copySignIn")}
          onClick={copyUrl}
        >
          <Copy aria-hidden="true" />
        </Button>
        <Button asChild size="icon" variant="outline">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={t("accounts.openSignIn")}
            title={t("accounts.openSignIn")}
          >
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      </div>
    </section>
  );
}
