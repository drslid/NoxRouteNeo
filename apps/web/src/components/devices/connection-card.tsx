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
import { Check, Copy, KeyRound, LoaderCircle, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";
import { platformMessageKey, profileMessageKey } from "@/i18n/labels";

type ConnectionPayload = {
  directUri: string;
  subscriptionUrl: string;
  profile: "fast" | "balanced" | "stealth";
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
  const [mode, setMode] = useState<"subscription" | "direct">("subscription");
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
  const value =
    mode === "subscription"
      ? query.data?.subscriptionUrl
      : query.data?.directUri;

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
                  src={`/api/portal/devices/${device.id}/qr?kind=${mode}`}
                  width={220}
                  height={220}
                  unoptimized
                  alt={t("connection.qrAlt", {
                    mode: t(
                      mode === "subscription"
                        ? "connection.subscription"
                        : "connection.direct",
                    ),
                    name: device.name,
                  })}
                />
              </div>
              <div className="min-w-0">
                <div className="inline-flex rounded-md border bg-muted p-1">
                  {(["subscription", "direct"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cn(
                        "h-8 rounded px-3 text-xs font-medium capitalize",
                        mode === item && "bg-card shadow-sm",
                      )}
                      onClick={() => setMode(item)}
                    >
                      {t(
                        item === "subscription"
                          ? "connection.subscription"
                          : "connection.direct",
                      )}
                    </button>
                  ))}
                </div>
                <h3 className="mt-5 text-sm font-semibold">
                  {mode === "subscription"
                    ? t("connection.subscriptionUrl")
                    : t("connection.directString")}
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {mode === "subscription"
                    ? t("connection.subscriptionHelp")
                    : t("connection.directHelp")}
                </p>
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
