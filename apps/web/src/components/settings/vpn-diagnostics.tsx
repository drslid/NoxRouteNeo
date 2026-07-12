"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@noxroute/ui";
import {
  CheckCircle2,
  Globe2,
  LoaderCircle,
  Network,
  Play,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";

type DiagnosticResult = {
  ok: true;
  tested_at: string;
  endpoint: {
    status: "reachable" | "unreachable";
    host: string;
    port: number;
    resolved_ip?: string;
    latency_ms?: number;
    error?: string;
  };
  reality: {
    resolved_ip: string;
    latency_ms: number;
    tls_version: string;
    alpn: string | null;
  };
  tunnel: {
    status: "passed";
    scope: "public-endpoint" | "local-fallback";
    exit_ip: string;
    latency_ms: number;
    device_name: string;
    public_endpoint_error: string | null;
  };
};

export function VpnDiagnostics() {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  async function runDiagnostic() {
    setRunning(true);
    try {
      const response = await fetch("/api/admin/diagnostics/vpn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json()) as DiagnosticResult & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? t("diagnostics.failed"));
      }
      setResult(payload);
      toast.success(t("diagnostics.passed"));
    } catch (error) {
      setResult(null);
      toast.error(t("diagnostics.failed"), {
        description:
          error instanceof Error ? error.message : t("settings.serverRejected"),
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 border-b">
        <div>
          <CardTitle>{t("diagnostics.title")}</CardTitle>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("diagnostics.description")}
          </p>
        </div>
        <Button onClick={runDiagnostic} disabled={running}>
          {running ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {running ? t("diagnostics.running") : t("diagnostics.run")}
        </Button>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        {!result ? (
          <div className="flex min-h-24 items-center gap-3 text-sm text-muted-foreground">
            <Network className="size-5 shrink-0" aria-hidden="true" />
            <p>{t("diagnostics.empty")}</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">
                <CheckCircle2 aria-hidden="true" />
                {t("diagnostics.tunnelPassed")}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(result.tested_at).toLocaleString()}
              </span>
            </div>
            <div className="grid divide-y border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <DiagnosticValue
                icon={Globe2}
                label={t("diagnostics.publicEndpoint")}
                value={`${result.endpoint.host}:${result.endpoint.port}`}
                detail={
                  result.endpoint.status === "reachable"
                    ? t("diagnostics.reachable", {
                        latency: result.endpoint.latency_ms ?? 0,
                      })
                    : t("diagnostics.unreachable")
                }
              />
              <DiagnosticValue
                icon={ShieldCheck}
                label={t("diagnostics.realityTarget")}
                value={result.reality.tls_version}
                detail={t("diagnostics.realityDetail", {
                  latency: result.reality.latency_ms,
                  ip: result.reality.resolved_ip,
                })}
              />
              <DiagnosticValue
                icon={Network}
                label={t("diagnostics.vpnExit")}
                value={result.tunnel.exit_ip}
                detail={t("diagnostics.tunnelDetail", {
                  device: result.tunnel.device_name,
                  latency: result.tunnel.latency_ms,
                })}
              />
            </div>
            {result.tunnel.scope === "local-fallback" && (
              <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <p>{t("diagnostics.localFallback")}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticValue({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Network;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-3 break-all text-sm font-semibold" dir="ltr">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}
