"use client";

import { authClient } from "@noxroute/auth/client";
import { Button, Input, Label } from "@noxroute/ui";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";

export function TwoFactorForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error(t("auth.validSixDigits"));
      return;
    }

    setPending(true);
    const result = await authClient.twoFactor.verifyTotp({
      code,
      trustDevice: false,
    });
    setPending(false);

    if (result.error) {
      toast.error(t("auth.verificationFailed"), {
        description: t("auth.invalidCode"),
      });
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form className="mt-8 grid gap-5" onSubmit={verify}>
      <div className="grid gap-2">
        <Label htmlFor="totp">{t("auth.authenticationCode")}</Label>
        <Input
          id="totp"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          inputMode="numeric"
          autoComplete="one-time-code"
          className="font-mono text-lg tracking-[0.35em]"
          maxLength={6}
          required
        />
      </div>
      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <ShieldCheck aria-hidden="true" />
        )}
        {t("auth.verify")}
      </Button>
    </form>
  );
}
