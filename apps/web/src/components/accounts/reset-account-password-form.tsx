"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  resetAccountPasswordSchema,
  type ResetAccountPasswordInput,
} from "@noxroute/contracts";
import { Button, Input } from "@noxroute/ui";
import { KeyRound, LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";

export function ResetAccountPasswordForm({ userId }: { userId: string }) {
  const { t } = useI18n();
  const form = useForm<ResetAccountPasswordInput>({
    resolver: zodResolver(resetAccountPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function submit(values: ResetAccountPasswordInput) {
    const response = await fetch(`/api/admin/accounts/${userId}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(t("accounts.passwordResetFailed"), {
        description: payload.error,
      });
      return;
    }
    form.reset();
    toast.success(t("accounts.passwordReset"), {
      description: t("accounts.sessionsRevoked"),
    });
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      <label className="grid gap-2 text-sm font-medium">
        {t("accounts.newTemporaryPassword")}
        <Input
          type="password"
          autoComplete="new-password"
          {...form.register("newPassword")}
        />
        {form.formState.errors.newPassword && (
          <span className="text-xs font-normal text-destructive">
            {form.formState.errors.newPassword.message}
          </span>
        )}
      </label>
      <label className="grid gap-2 text-sm font-medium">
        {t("auth.confirmPassword")}
        <Input
          type="password"
          autoComplete="new-password"
          {...form.register("confirmPassword")}
        />
        {form.formState.errors.confirmPassword && (
          <span className="text-xs font-normal text-destructive">
            {form.formState.errors.confirmPassword.message}
          </span>
        )}
      </label>
      <Button
        className="justify-self-end"
        type="submit"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <KeyRound />
        )}
        {t("accounts.resetPassword")}
      </Button>
    </form>
  );
}
