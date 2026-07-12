"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createIpBanSchema, type CreateIpBanInput } from "@noxroute/contracts";
import { Button, Checkbox, Input } from "@noxroute/ui";
import { Ban, LoaderCircle, LockKeyhole, LockOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";

export function CreateIpBanForm() {
  const { t } = useI18n();
  const router = useRouter();
  const form = useForm<CreateIpBanInput>({
    resolver: zodResolver(createIpBanSchema),
    defaultValues: { ipAddress: "", reason: "", permanent: false },
  });

  async function submit(values: CreateIpBanInput) {
    const response = await fetch("/api/admin/security/bans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(t("threats.actionFailed"), { description: payload.error });
      return;
    }
    toast.success(t("threats.addressBlocked"));
    form.reset();
    router.refresh();
  }

  return (
    <form
      className="grid gap-3 border-b p-4 lg:grid-cols-[minmax(180px,0.7fr)_minmax(240px,1fr)_auto_auto] lg:items-start"
      onSubmit={form.handleSubmit(submit)}
    >
      <label className="grid gap-1.5">
        <span className="text-xs font-medium">{t("threats.ipAddress")}</span>
        <Input
          dir="ltr"
          placeholder="203.0.113.10"
          aria-invalid={Boolean(form.formState.errors.ipAddress)}
          {...form.register("ipAddress")}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs font-medium">{t("threats.reason")}</span>
        <Input
          placeholder={t("threats.reasonPlaceholder")}
          aria-invalid={Boolean(form.formState.errors.reason)}
          {...form.register("reason")}
        />
      </label>
      <label className="mt-6 flex h-9 items-center gap-2 whitespace-nowrap text-xs font-medium">
        <Checkbox {...form.register("permanent")} />
        {t("threats.permanent")}
      </label>
      <Button
        className="mt-6"
        type="submit"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <Ban aria-hidden="true" />
        )}
        {t("threats.blockAddress")}
      </Button>
    </form>
  );
}

export function IpBanActions({
  banId,
  active,
  permanent,
}: {
  banId: string;
  active: boolean;
  permanent: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();

  async function update(action: "release" | "temporary" | "permanent") {
    if (!window.confirm(t("threats.confirmAction"))) return;
    const response = await fetch(`/api/admin/security/bans/${banId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(t("threats.actionFailed"), { description: payload.error });
      return;
    }
    toast.success(t("threats.actionApplied"));
    router.refresh();
  }

  if (!active) {
    return (
      <Button variant="outline" size="sm" onClick={() => update("temporary")}>
        <LockKeyhole aria-hidden="true" />
        {t("threats.blockSixHours")}
      </Button>
    );
  }
  return (
    <div className="flex justify-end gap-2">
      {!permanent && (
        <Button variant="outline" size="sm" onClick={() => update("permanent")}>
          <LockKeyhole aria-hidden="true" />
          {t("threats.makePermanent")}
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => update("release")}>
        <LockOpen aria-hidden="true" />
        {t("threats.unblock")}
      </Button>
    </div>
  );
}
