"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  createAccountSchema,
  type CreateAccountInput,
} from "@noxroute/contracts";
import { Button, Input, Select } from "@noxroute/ui";
import { Eye, EyeOff, LoaderCircle, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";

const speedOptions = [0, 2, 5, 10, 20, 50, 100];

export function CreateAccountForm({
  canCreateAdmin,
  vpnDefaults,
}: {
  canCreateAdmin: boolean;
  vpnDefaults: Pick<
    CreateAccountInput,
    "maxDevices" | "maxDays" | "maxGigabytes" | "speedLimitMbps"
  >;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const form = useForm<CreateAccountInput>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      displayName: "",
      username: "",
      password: "",
      role: "user",
      ...vpnDefaults,
    },
  });
  const role = useWatch({ control: form.control, name: "role" });

  async function submit(values: CreateAccountInput) {
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !payload.id) {
      toast.error(t("accounts.creationFailed"), {
        description: payload.error ?? t("accounts.serverRejected"),
      });
      return;
    }

    toast.success(t("accounts.created"));
    router.push(`/admin/accounts/${payload.id}`);
    router.refresh();
  }

  return (
    <form className="grid gap-6" onSubmit={form.handleSubmit(submit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("accounts.displayName")}
          error={form.formState.errors.displayName?.message}
        >
          <Input autoComplete="name" {...form.register("displayName")} />
        </Field>
        <Field
          label={t("auth.username")}
          error={form.formState.errors.username?.message}
        >
          <Input autoComplete="off" {...form.register("username")} />
        </Field>
        <Field
          label={t("accounts.temporaryPassword")}
          error={form.formState.errors.password?.message}
        >
          <div className="relative">
            <Input
              className="pe-10"
              type={passwordVisible ? "text" : "password"}
              autoComplete="new-password"
              {...form.register("password")}
            />
            <Button
              className="absolute end-1 top-1/2 -translate-y-1/2 text-muted-foreground"
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setPasswordVisible((visible) => !visible)}
              aria-label={
                passwordVisible
                  ? t("auth.hidePassword")
                  : t("auth.showPassword")
              }
              title={
                passwordVisible
                  ? t("auth.hidePassword")
                  : t("auth.showPassword")
              }
            >
              {passwordVisible ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
            </Button>
          </div>
        </Field>
        <Field
          label={t("accounts.accountRole")}
          error={form.formState.errors.role?.message}
        >
          <Select {...form.register("role")}>
            <option value="user">{t("role.user")}</option>
            {canCreateAdmin && <option value="admin">{t("role.admin")}</option>}
          </Select>
        </Field>
      </div>

      {role === "user" && (
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
            label={t("settings.durationDays")}
            hint={t("accounts.leaveUnlimited")}
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
            hint={t("accounts.leaveUnlimited")}
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

      <div className="flex justify-end gap-3 border-t pt-5">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus aria-hidden="true" />
          )}
          {t("accounts.createTitle")}
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
