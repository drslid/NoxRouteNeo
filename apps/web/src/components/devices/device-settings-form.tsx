"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateDeviceSchema,
  type UpdateDeviceInput,
  type ConnectionProfile,
} from "@noxroute/contracts";
import { Button, Input, Select, cn } from "@noxroute/ui";
import { LoaderCircle, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { connectionProfiles } from "@/lib/vless";
import { useI18n } from "@/i18n/client";
import { profileMessageKey } from "@/i18n/labels";

const profiles = Object.entries(connectionProfiles) as Array<
  [ConnectionProfile, (typeof connectionProfiles)[ConnectionProfile]]
>;

export function DeviceSettingsForm({
  deviceId,
  initialValues,
}: {
  deviceId: string;
  initialValues: UpdateDeviceInput;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const form = useForm<UpdateDeviceInput>({
    resolver: zodResolver(updateDeviceSchema),
    defaultValues: initialValues,
  });
  const selectedProfile = useWatch({
    control: form.control,
    name: "connectionProfile",
  });

  async function submit(values: UpdateDeviceInput) {
    const response = await fetch(`/api/portal/devices/${deviceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(t("devices.updateFailed"), {
        description: payload.error ?? t("settings.serverRejected"),
      });
      return;
    }

    toast.success(t("devices.updated"), {
      description: t("devices.refreshBeforeReconnect"),
    });
    router.refresh();
  }

  async function revoke() {
    if (!window.confirm(t("devices.revokeConfirm"))) {
      return;
    }
    const response = await fetch(`/api/portal/devices/${deviceId}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(t("devices.revocationFailed"), {
        description: payload.error,
      });
      return;
    }

    toast.success(t("devices.revoked"));
    router.replace("/portal/devices");
    router.refresh();
  }

  return (
    <form className="grid gap-6" onSubmit={form.handleSubmit(submit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t("devices.name")}</span>
          <Input {...form.register("name")} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t("common.platform")}</span>
          <Select {...form.register("platform")}>
            <option value="ios">{t("platform.ios")}</option>
            <option value="android">{t("platform.android")}</option>
            <option value="desktop">{t("platform.desktop")}</option>
            <option value="other">{t("platform.other")}</option>
          </Select>
        </label>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">
          {t("devices.connectionProfile")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {profiles.map(([value]) => (
            <label
              key={value}
              className={cn(
                "cursor-pointer rounded-md border bg-background p-3 transition-colors",
                selectedProfile === value &&
                  "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600",
              )}
            >
              <input
                className="sr-only"
                type="radio"
                value={value}
                {...form.register("connectionProfile")}
              />
              <strong className="block text-sm font-semibold">
                {t(profileMessageKey(value))}
              </strong>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {t(
                  `profile.${value}Summary` as
                    | "profile.fastSummary"
                    | "profile.balancedSummary"
                    | "profile.stealthSummary",
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col-reverse justify-between gap-3 border-t pt-5 sm:flex-row">
        <Button type="button" variant="destructive" onClick={revoke}>
          <Trash2 aria-hidden="true" />
          {t("devices.revoke")}
        </Button>
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
