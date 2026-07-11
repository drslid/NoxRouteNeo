"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateInstanceSettingsSchema,
  type UpdateInstanceSettingsInput,
} from "@noxroute/contracts";
import { Button, Checkbox, Input, Select } from "@noxroute/ui";
import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";
import { localeOptions } from "@/i18n/config";

const speedOptions = [0, 2, 5, 10, 20, 50, 100];

export function InstanceSettingsForm({
  initialValues,
  duckdnsConfigured,
}: {
  initialValues: UpdateInstanceSettingsInput;
  duckdnsConfigured: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const form = useForm<UpdateInstanceSettingsInput>({
    resolver: zodResolver(updateInstanceSettingsSchema),
    defaultValues: initialValues,
  });

  async function submit(values: UpdateInstanceSettingsInput) {
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(t("settings.updateFailed"), {
        description: payload.error ?? t("settings.serverRejected"),
      });
      return;
    }

    toast.success(t("settings.saved"), {
      description: t("settings.savedDescription"),
    });
    router.refresh();
  }

  return (
    <form className="space-y-8" onSubmit={form.handleSubmit(submit)}>
      <section>
        <SectionHeading
          title={t("settings.publicEndpoints")}
          description={t("settings.publicEndpointsHelp")}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t("common.language")} hint={t("language.help")}>
            <Select {...form.register("appLocale")}>
              {localeOptions.map((locale) => (
                <option key={locale.value} value={locale.value}>
                  {locale.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("settings.adminDomain")}
            error={form.formState.errors.adminDomain?.message}
          >
            <Input
              dir="ltr"
              placeholder="admin-name.duckdns.org"
              {...form.register("adminDomain")}
            />
          </Field>
          <Field
            label={t("settings.vpnDomain")}
            error={form.formState.errors.vpnDomain?.message}
          >
            <Input
              dir="ltr"
              placeholder="vpn-name.duckdns.org"
              {...form.register("vpnDomain")}
            />
          </Field>
          <Field
            label={t("settings.duckdnsToken")}
            hint={
              duckdnsConfigured
                ? t("settings.tokenConfigured")
                : t("settings.tokenRequired")
            }
            error={form.formState.errors.duckdnsToken?.message}
          >
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={
                duckdnsConfigured
                  ? t("settings.keepToken")
                  : t("settings.tokenFromDuckdns")
              }
              {...form.register("duckdnsToken")}
            />
          </Field>
          <Field
            label={t("settings.adminPort")}
            error={form.formState.errors.adminHttpsPort?.message}
          >
            <Input
              type="number"
              min={1}
              max={65535}
              {...form.register("adminHttpsPort", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label={t("settings.serverBandwidth")}
            hint={t("settings.udpDirect")}
          >
            <Select
              {...form.register("serverBandwidthLimitPercent", {
                setValueAs: (value) => Number(value),
              })}
            >
              {[25, 50, 75, 90, 100].map((percent) => (
                <option key={percent} value={percent}>
                  {t("settings.bandwidthPercent", { percent })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="border-t pt-7">
        <SectionHeading
          title={t("settings.transport")}
          description={t("settings.transportHelp")}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label={t("settings.xhttpPath")}
            error={form.formState.errors.xhttpPath?.message}
          >
            <Input dir="ltr" {...form.register("xhttpPath")} />
          </Field>
          <Field
            label={t("settings.realityTarget")}
            error={form.formState.errors.realityTarget?.message}
          >
            <Input dir="ltr" {...form.register("realityTarget")} />
          </Field>
          <Field
            label={t("settings.realitySni")}
            error={form.formState.errors.realityServerName?.message}
          >
            <Input dir="ltr" {...form.register("realityServerName")} />
          </Field>
          <Field label={t("settings.telemetryInterval")}>
            <Select
              {...form.register("telemetryIntervalSeconds", {
                setValueAs: (value) => Number(value),
              })}
            >
              {[10, 15, 30, 60, 120].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {t("settings.everySeconds", { seconds })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="border-t pt-7">
        <SectionHeading
          title={t("settings.defaultUsers")}
          description={t("settings.defaultUsersHelp")}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label={t("settings.defaultProfile")}>
            <Select {...form.register("defaultConnectionProfile")}>
              <option value="fast">{t("profile.fast")}</option>
              <option value="balanced">{t("profile.balanced")}</option>
              <option value="stealth">{t("profile.stealth")}</option>
            </Select>
          </Field>
          <Field label={t("settings.maxDevices")}>
            <Input
              type="number"
              min={1}
              max={50}
              {...form.register("defaultMaxDevices", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label={t("settings.durationDays")}
            hint={t("settings.emptyUnlimited")}
          >
            <Input
              type="number"
              min={1}
              max={3650}
              {...form.register("defaultMaxDays", {
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
              {...form.register("defaultMaxGigabytes", {
                setValueAs: (value) => (value === "" ? null : Number(value)),
              })}
            />
          </Field>
          <Field
            label={t("settings.defaultSpeed")}
            hint={t("settings.udpDirect")}
          >
            <Select
              {...form.register("defaultSpeedLimitMbps", {
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
      </section>

      <section className="border-t pt-7">
        <SectionHeading
          title={t("settings.enforcement")}
          description={t("settings.enforcementHelp")}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ToggleField
            label={t("settings.subscription")}
            {...form.register("subscriptionEnabled")}
          />
          <ToggleField
            label={t("settings.blockQuota")}
            {...form.register("enforceQuota")}
          />
          <ToggleField
            label={t("settings.blockExpiry")}
            {...form.register("enforceExpiry")}
          />
        </div>
      </section>

      <input
        type="hidden"
        {...form.register("vpnPort", { valueAsNumber: true })}
      />
      <div className="flex justify-end border-t pt-5">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          {form.formState.isSubmitting
            ? t("common.saving")
            : t("settings.saveConfiguration")}
        </Button>
      </div>
    </form>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
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

function ToggleField({
  label,
  ...props
}: { label: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm font-medium">
      <Checkbox {...props} />
      {label}
    </label>
  );
}
