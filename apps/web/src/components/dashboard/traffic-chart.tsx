"use client";

import {
  Button,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@noxroute/ui";
import { ChartNoAxesColumnIncreasing, Gauge } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { useI18n } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";

type TrafficSample = {
  timestamp: string;
  sampleWindowSeconds: number;
  uplinkMegabytes: number;
  downlinkMegabytes: number;
  uplinkMbps: number;
  downlinkMbps: number;
};

function formatMbps(value: number, locale: string) {
  return `${value.toLocaleString(locale, {
    minimumFractionDigits: value > 0 && value < 0.1 ? 3 : 1,
    maximumFractionDigits: value < 10 ? 3 : 1,
  })} Mbps`;
}

export function TrafficChart({ samples }: { samples: TrafficSample[] }) {
  const { locale, t } = useI18n();
  const numberLocale = intlLocale(locale);
  const [mode, setMode] = useState<"speed" | "volume">("speed");
  const chartConfig = {
    downlinkMbps: { label: t("chart.downloadMbps"), color: "var(--chart-1)" },
    uplinkMbps: { label: t("chart.uploadMbps"), color: "var(--chart-2)" },
    downlinkMegabytes: {
      label: t("chart.downloadMb"),
      color: "var(--chart-1)",
    },
    uplinkMegabytes: { label: t("chart.uploadMb"), color: "var(--chart-2)" },
  };

  if (samples.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center border-t border-border text-center">
        <div>
          <p className="text-sm font-medium">{t("chart.waitingTraffic")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("chart.waitingTrafficHelp")}
          </p>
        </div>
      </div>
    );
  }

  const latestSample = samples.at(-1)!;
  const isSpeed = mode === "speed";
  const downloadKey = isSpeed ? "downlinkMbps" : "downlinkMegabytes";
  const uploadKey = isSpeed ? "uplinkMbps" : "uplinkMegabytes";
  const unit = isSpeed ? "Mbps" : "MB";

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 border-b px-5 py-4 sm:flex-row sm:items-center">
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          <div>
            <p className="text-xs text-muted-foreground">
              {t("chart.downloadNow")}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatMbps(latestSample.downlinkMbps, numberLocale)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t("chart.uploadNow")}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatMbps(latestSample.uplinkMbps, numberLocale)}
            </p>
          </div>
        </div>
        <div
          className="grid grid-cols-2 rounded-md border border-border bg-muted p-0.5"
          role="group"
          aria-label={t("chart.mode")}
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={
              isSpeed ? "bg-background shadow-sm hover:bg-background" : ""
            }
            aria-pressed={isSpeed}
            title={t("chart.showSpeed")}
            onClick={() => setMode("speed")}
          >
            <Gauge aria-hidden="true" />
            {t("chart.speed")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={
              !isSpeed ? "bg-background shadow-sm hover:bg-background" : ""
            }
            aria-pressed={!isSpeed}
            title={t("chart.showData")}
            onClick={() => setMode("volume")}
          >
            <ChartNoAxesColumnIncreasing aria-hidden="true" />
            {t("chart.data")}
          </Button>
        </div>
      </div>

      <div className="px-5 pt-3 text-xs text-muted-foreground">
        {t("chart.latestAverage", {
          seconds: Math.round(latestSample.sampleWindowSeconds),
          unit,
        })}
      </div>
      <ChartContainer config={chartConfig} className="h-60 min-h-60">
        <AreaChart data={samples} margin={{ left: 0, right: 8, top: 12 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tickFormatter={(value: string) =>
              new Intl.DateTimeFormat(numberLocale, {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(value))
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value) => {
              const numericValue = Number(value);
              return numericValue.toLocaleString(numberLocale, {
                maximumFractionDigits:
                  numericValue > 0 && numericValue < 0.1 ? 3 : 2,
              });
            }}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) =>
                  new Date(String(value)).toLocaleTimeString(numberLocale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                }
              />
            }
          />
          <Area
            type="monotone"
            dataKey={downloadKey}
            stroke={`var(--color-${downloadKey})`}
            fill={`var(--color-${downloadKey})`}
            fillOpacity={0.14}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey={uploadKey}
            stroke={`var(--color-${uploadKey})`}
            fill={`var(--color-${uploadKey})`}
            fillOpacity={0.08}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
