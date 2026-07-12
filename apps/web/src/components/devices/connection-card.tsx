"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
} from "@noxroute/ui";
import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  Settings,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";
import { platformMessageKey, profileMessageKey } from "@/i18n/labels";
import { buildIncyImportUrl } from "@/lib/incy";

type ConnectionPayload = {
  subscriptionUrl: string;
  profile: "fast" | "balanced" | "stealth";
  binding: {
    status: "bound" | "pending";
    boundAt: string | null;
    lastUsedAt: string | null;
    platform: string | null;
    model: string | null;
    osVersion: string | null;
    lastIpAddress: string | null;
  };
};

export function ConnectionCard({
  device,
  initialOpen,
}: {
  device: { id: string; name: string; platform: string; profile: string };
  initialOpen: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(initialOpen);
  const [copied, setCopied] = useState(false);
  const query = useQuery({
    queryKey: ["device-connection", device.id],
    enabled: open,
    queryFn: async () => {
      const response = await fetch(
        `/api/portal/devices/${device.id}/connection`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as ConnectionPayload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? t("connection.unavailable"));
      }
      return payload;
    },
  });
  const value = query.data?.subscriptionUrl;
  const incyImportUrl = value ? buildIncyImportUrl(value) : null;

  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(t("connection.valueCopied"));
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 border-b">
        <div className="min-w-0">
          <CardTitle className="truncate">{device.name}</CardTitle>
          <p className="mt-1 text-xs capitalize text-muted-foreground">
            {t(platformMessageKey(device.platform))} /{" "}
            {t(profileMessageKey(device.profile))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">{t("common.active")}</Badge>
          <Button asChild variant="ghost" size="icon">
            <Link
              href={`/portal/devices/${device.id}`}
              aria-label={t("devices.configure", { name: device.name })}
              title={t("devices.configure", { name: device.name })}
            >
              <Settings aria-hidden="true" />
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen((value) => !value)}
          >
            <KeyRound aria-hidden="true" />
            {open ? t("connection.hide") : t("common.open")}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="p-5 sm:p-6">
          {query.isPending && (
            <div className="grid min-h-52 place-items-center text-sm text-muted-foreground">
              <LoaderCircle
                className="animate-spin"
                aria-label={t("connection.loading")}
              />
            </div>
          )}
          {query.isError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {query.error.message}
            </div>
          )}
          {query.data && (
            <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="rounded-md border bg-white p-3">
                <Image
                  className="h-auto w-full"
                  src={`/api/portal/devices/${device.id}/qr`}
                  width={220}
                  height={220}
                  unoptimized
                  alt={t("connection.qrAlt", {
                    mode: t("connection.subscription"),
                    name: device.name,
                  })}
                />
              </div>
              <div className="min-w-0">
                <div
                  className={cn(
                    "flex items-start gap-3 rounded-md border p-3",
                    query.data.binding.status === "bound"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                      : "border-amber-200 bg-amber-50 text-amber-950",
                  )}
                >
                  <ShieldCheck
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs font-semibold">
                      {query.data.binding.status === "bound"
                        ? t("connection.deviceBound")
                        : t("connection.awaitingBinding")}
                    </p>
                    <p className="mt-1 text-xs leading-5 opacity-80">
                      {query.data.binding.status === "bound"
                        ? t("connection.deviceBoundHelp", {
                            device:
                              query.data.binding.model ??
                              query.data.binding.platform ??
                              t("common.device"),
                          })
                        : t("connection.awaitingBindingHelp")}
                    </p>
                  </div>
                </div>
                <h3 className="mt-5 text-sm font-semibold">
                  {t("connection.subscriptionUrl")}
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("connection.subscriptionHelp")}
                </p>
                {incyImportUrl && (
                  <Button asChild className="mt-4">
                    <a href={incyImportUrl}>
                      <Smartphone aria-hidden="true" />
                      {t("connection.openInIncy")}
                    </a>
                  </Button>
                )}
                <div className="mt-4 flex min-w-0 items-start gap-2 rounded-md border bg-muted/50 p-3">
                  <code
                    className="min-w-0 flex-1 break-all text-xs leading-5"
                    dir="ltr"
                  >
                    {value}
                  </code>
                  <Button
                    className="shrink-0"
                    variant="outline"
                    size="icon"
                    onClick={copy}
                    aria-label={t("connection.copyValue")}
                    title={t("connection.copyValue")}
                  >
                    {copied ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <Copy aria-hidden="true" />
                    )}
                  </Button>
                </div>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  {t("connection.profileRefresh")}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
