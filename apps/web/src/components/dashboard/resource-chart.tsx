"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@noxroute/ui";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { useI18n } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";

type ResourceSample = {
  timestamp: string;
  cpuPercent: number;
  memoryMegabytes: number;
};

export function ResourceChart({ samples }: { samples: ResourceSample[] }) {
  const { locale, t } = useI18n();
  const numberLocale = intlLocale(locale);
  const chartConfig = {
    cpuPercent: { label: "CPU (%)", color: "var(--chart-3)" },
    memoryMegabytes: { label: t("chart.memoryMb"), color: "var(--chart-2)" },
  };
  if (samples.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center text-center">
        <div>
          <p className="text-sm font-medium">{t("chart.waitingResources")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("chart.waitingResourcesHelp")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pt-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-[2px] bg-[var(--chart-3)]" />
          CPU (%)
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-[2px] bg-[var(--chart-2)]" />
          {t("chart.memoryMb")}
        </span>
      </div>
      <ChartContainer config={chartConfig} className="h-60 min-h-60">
        <LineChart data={samples} margin={{ left: 0, right: 0, top: 16 }}>
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
            yAxisId="cpu"
            tickLine={false}
            axisLine={false}
            width={42}
            domain={[
              0,
              (dataMax: number) => Math.max(100, Math.ceil(dataMax / 10) * 10),
            ]}
            tickFormatter={(value) => `${value}%`}
          />
          <YAxis
            yAxisId="memory"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={52}
            domain={[0, "auto"]}
            tickFormatter={(value) => `${Math.round(Number(value))} MB`}
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
          <Line
            yAxisId="cpu"
            type="monotone"
            dataKey="cpuPercent"
            stroke="var(--color-cpuPercent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            yAxisId="memory"
            type="monotone"
            dataKey="memoryMegabytes"
            stroke="var(--color-memoryMegabytes)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
