"use client";

import {
  updateInstanceSettingsSchema,
  type UpdateInstanceSettingsInput,
} from "@noxroute/contracts";
import { Button, Checkbox, Input, Select } from "@noxroute/ui";
import { CheckCircle2, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";
import { localeOptions } from "@/i18n/config";

export function InstanceSettingsForm({
  initialValues,
  duckdnsConfigured,
  recommendedBandwidthMbps,
  bandwidthOptions,
  speedOptions,
}: {
  initialValues: UpdateInstanceSettingsInput;
  duckdnsConfigured: boolean;
  recommendedBandwidthMbps: number;
  bandwidthOptions: number[];
  speedOptions: number[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const form = useForm<UpdateInstanceSettingsInput>({
    defaultValues: initialValues,
  });
  const [realityCheck, setRealityCheck] = useState<{
    latencyMs: number;
    tlsVersion: string;
    resolvedIp: string;
    target: string;
    serverName: string;
  } | null>(null);
  const [checkingReality, setCheckingReality] = useState(false);
  const [currentRealityTarget, currentRealityServerName] = useWatch({
    control: form.control,
    name: ["realityTarget", "realityServerName"],
  });
  const realityCheckIsCurrent =
    realityCheck?.target === currentRealityTarget &&
    realityCheck.serverName === currentRealityServerName;

  async function testRealityTarget() {
    setCheckingReality(true);
    setRealityCheck(null);
    const target = form.getValues("realityTarget");
    const serverName = form.getValues("realityServerName");
    try {
      const response = await fetch("/api/admin/diagnostics/reality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          serverName,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        latency_ms?: number;
        tls_version?: string;
        resolved_ip?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? t("settings.realityCheckFailed"));
      }
      setRealityCheck({
        latencyMs: payload.latency_ms ?? 0,
        tlsVersion: payload.tls_version ?? "TLS",
        resolvedIp: payload.resolved_ip ?? "-",
        target,
        serverName,
      });
      toast.success(t("settings.realityCheckPassed"));
    } catch (error) {
      toast.error(t("settings.realityCheckFailed"), {
        description:
          error instanceof Error ? error.message : t("settings.serverRejected"),
      });
    } finally {
      setCheckingReality(false);
    }
  }

  async function submit(rawValues: UpdateInstanceSettingsInput) {
    form.clearErrors();
    const result = updateInstanceSettingsSchema.safeParse(
      normalizeSettingsValues(rawValues),
    );
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          form.setError(field as FieldPath<UpdateInstanceSettingsInput>, {
            type: "validate",
            message: issue.message,
          });
        }
      }
      toast.error(t("settings.updateFailed"), {
        description: result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
      return;
    }

    const values = result.data;
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
            label={t("settings.availableBandwidth")}
            hint={t("settings.bandwidthEstimate")}
            error={form.formState.errors.serverBandwidthMbps?.message}
          >
            <Select
              {...form.register("serverBandwidthMbps", {
                setValueAs: nullablePositiveNumber,
              })}
            >
              <option value="">
                {t("settings.bandwidthAutomatic", {
                  mbps: recommendedBandwidthMbps,
                })}
              </option>
              {bandwidthOptions.map((bandwidth) => (
                <option key={bandwidth} value={bandwidth}>
                  {bandwidth} Mbps
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("settings.serverBandwidth")}
            hint={t("settings.bandwidthGuardHelp")}
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
            hint={t("settings.xhttpPathHelp")}
            error={form.formState.errors.xhttpPath?.message}
          >
            <Input dir="ltr" {...form.register("xhttpPath")} />
          </Field>
          <Field
            label={t("settings.realityTarget")}
            hint={t("settings.realityTargetHelp")}
            error={form.formState.errors.realityTarget?.message}
          >
            <Input dir="ltr" {...form.register("realityTarget")} />
          </Field>
          <Field
            label={t("settings.realitySni")}
            hint={t("settings.realitySniHelp")}
            error={form.formState.errors.realityServerName?.message}
          >
            <Input dir="ltr" {...form.register("realityServerName")} />
          </Field>
          <div className="flex items-end">
            <Button
              className="w-full sm:w-auto"
              type="button"
              variant="outline"
              onClick={testRealityTarget}
              disabled={checkingReality || form.formState.isSubmitting}
            >
              {checkingReality ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : realityCheckIsCurrent ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              {checkingReality
                ? t("settings.realityChecking")
                : t("settings.realityCheck")}
            </Button>
          </div>
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
        {realityCheck && realityCheckIsCurrent && (
          <p className="mt-3 text-xs text-emerald-700" role="status" dir="ltr">
            {t("settings.realityCheckDetails", {
              tls: realityCheck.tlsVersion,
              latency: realityCheck.latencyMs,
              ip: realityCheck.resolvedIp,
            })}
          </p>
        )}
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
            error={form.formState.errors.defaultMaxDays?.message}
          >
            <Input
              type="number"
              min={1}
              max={3650}
              {...form.register("defaultMaxDays", {
                setValueAs: nullableNumber,
              })}
            />
          </Field>
          <Field
            label={t("settings.quotaGb")}
            hint={t("settings.emptyUnlimited")}
            error={form.formState.errors.defaultMaxGigabytes?.message}
          >
            <Input
              type="number"
              min={0.1}
              step={0.1}
              {...form.register("defaultMaxGigabytes", {
                setValueAs: nullableNumber,
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

function nullableNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function requiredNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function nullablePositiveNumber(value: unknown) {
  const parsed = nullableNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function normalizeSettingsValues(values: UpdateInstanceSettingsInput) {
  return {
    ...values,
    adminHttpsPort: requiredNumber(values.adminHttpsPort),
    vpnPort: 443 as const,
    defaultMaxDevices: requiredNumber(values.defaultMaxDevices),
    defaultMaxDays: nullableNumber(values.defaultMaxDays),
    defaultMaxGigabytes: nullableNumber(values.defaultMaxGigabytes),
    defaultSpeedLimitMbps: requiredNumber(values.defaultSpeedLimitMbps),
    serverBandwidthLimitPercent: requiredNumber(
      values.serverBandwidthLimitPercent,
    ),
    serverBandwidthMbps: nullablePositiveNumber(values.serverBandwidthMbps),
    telemetryIntervalSeconds: requiredNumber(values.telemetryIntervalSeconds),
  };
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
