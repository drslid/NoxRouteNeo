"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateAccountSchema,
  type UpdateAccountInput,
} from "@noxroute/contracts";
import { Button, Input, Select } from "@noxroute/ui";
import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";

export function AccountSettingsForm({
  userId,
  isVpnUser,
  initialValues,
  speedOptions,
}: {
  userId: string;
  isVpnUser: boolean;
  initialValues: UpdateAccountInput;
  speedOptions: number[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const form = useForm<UpdateAccountInput>({
    resolver: zodResolver(updateAccountSchema),
    defaultValues: initialValues,
  });

  async function submit(values: UpdateAccountInput) {
    const response = await fetch(`/api/admin/accounts/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(t("accounts.updateFailed"), {
        description: payload.error ?? t("settings.serverRejected"),
      });
      return;
    }

    toast.success(t("accounts.updated"));
    router.refresh();
  }

  return (
    <form className="grid gap-6" onSubmit={form.handleSubmit(submit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("accounts.displayName")}
          error={form.formState.errors.displayName?.message}
        >
          <Input {...form.register("displayName")} />
        </Field>
        <Field
          label={t("common.status")}
          error={form.formState.errors.status?.message}
        >
          <Select {...form.register("status")}>
            <option value="active">{t("common.active")}</option>
            <option value="suspended">{t("common.suspended")}</option>
          </Select>
        </Field>
      </div>

      {isVpnUser && (
        <div className="grid gap-4 border-t pt-6 sm:grid-cols-2">
          <Field
            label={t("settings.maxDevices")}
            error={form.formState.errors.maxDevices?.message}
          >
            <Input
              type="number"
              min={1}
              max={50}
              {...form.register("maxDevices", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label={t("accounts.durationFromNow")}
            hint={t("settings.emptyUnlimited")}
          >
            <Input
              type="number"
              min={1}
              max={3650}
              {...form.register("maxDays", {
                setValueAs: (value) => (value === "" ? null : Number(value)),
              })}
            />
          </Field>
          <Field
            label={t("settings.quotaGb")}
            hint={t("settings.emptyUnlimited")}
          >
            <Input
              type="number"
              min={0.1}
              step={0.1}
              {...form.register("maxGigabytes", {
                setValueAs: (value) => (value === "" ? null : Number(value)),
              })}
            />
          </Field>
          <Field label={t("accounts.tcpSpeed")} hint={t("settings.udpDirect")}>
            <Select
              {...form.register("speedLimitMbps", {
                setValueAs: (value) => Number(value),
              })}
            >
              {speedOptions.map((speed) => (
                <option key={speed} value={speed}>
                  {speed === 0 ? t("common.unlimited") : `${speed} Mbps`}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="flex justify-end border-t pt-5">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          {form.formState.isSubmitting
            ? t("common.saving")
            : t("accounts.saveChanges")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <span className="text-sm font-medium leading-none text-foreground">
          {label}
        </span>
        {hint && (
          <span className="text-[11px] leading-4 text-muted-foreground sm:max-w-[55%] sm:text-end">
            {hint}
          </span>
        )}
      </span>
      {children}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </label>
  );
}
