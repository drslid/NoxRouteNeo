"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  createDeviceSchema,
  type CreateDeviceInput,
  type ConnectionProfile,
} from "@noxroute/contracts";
import { Button, Input, Select, cn } from "@noxroute/ui";
import { LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { connectionProfiles } from "@/lib/vless";
import { useI18n } from "@/i18n/client";
import { profileMessageKey } from "@/i18n/labels";

const profiles = Object.entries(connectionProfiles) as Array<
  [ConnectionProfile, (typeof connectionProfiles)[ConnectionProfile]]
>;

export function CreateDeviceForm() {
  const router = useRouter();
  const { t } = useI18n();
  const form = useForm<CreateDeviceInput>({
    resolver: zodResolver(createDeviceSchema),
    defaultValues: {
      name: "",
      platform: "ios",
      connectionProfile: "balanced",
    },
  });
  const selectedProfile = useWatch({
    control: form.control,
    name: "connectionProfile",
  });

  async function submit(values: CreateDeviceInput) {
    const response = await fetch("/api/portal/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json()) as {
      device?: { id: string };
      error?: string;
    };
    if (!response.ok || !payload.device) {
      toast.error(t("devices.registrationFailed"), {
        description: payload.error ?? t("devices.serverRejected"),
      });
      return;
    }

    toast.success(t("devices.registered"));
    router.push(`/portal/connection?device=${payload.device.id}`);
    router.refresh();
  }

  return (
    <form className="grid gap-6" onSubmit={form.handleSubmit(submit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t("devices.name")}</span>
          <Input
            placeholder={t("devices.namePlaceholder")}
            {...form.register("name")}
          />
          {form.formState.errors.name && (
            <span className="text-xs text-destructive">
              {form.formState.errors.name.message}
            </span>
          )}
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
        <p className="text-xs leading-5 text-muted-foreground">
          {t("devices.profileDisclaimer")}
        </p>
      </fieldset>

      <div className="flex justify-end gap-3 border-t pt-5">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          {t("devices.register")}
        </Button>
      </div>
    </form>
  );
}
