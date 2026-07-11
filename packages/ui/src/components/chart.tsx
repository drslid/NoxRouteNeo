"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  type TooltipContentProps,
} from "recharts";

import { cn } from "../lib/utils";

export type ChartConfig = Record<
  string,
  {
    label: React.ReactNode;
    color: string;
  }
>;

const ChartContext = React.createContext<ChartConfig | null>(null);

export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: React.ComponentProps<typeof ResponsiveContainer>["children"];
}) {
  const variables = Object.fromEntries(
    Object.entries(config).map(([key, item]) => [
      `--color-${key}`,
      item.color,
    ]),
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={config}>
      <div
        className={cn(
          "flex aspect-auto min-h-56 w-full justify-center text-xs",
          className,
        )}
        style={variables}
      >
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsTooltip;

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
}: Partial<TooltipContentProps<number, string>> & {
  labelFormatter?: (value: React.ReactNode) => React.ReactNode;
}) {
  const config = React.useContext(ChartContext);

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="min-w-36 rounded-md border border-border bg-popover p-2.5 text-popover-foreground shadow-md">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "value");
          const itemConfig = config?.[key];
          return (
            <div
              key={key}
              className="flex items-center justify-between gap-6 text-xs"
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <span
                  className="size-2 rounded-[2px]"
                  style={{ background: item.color ?? itemConfig?.color }}
                />
                {itemConfig?.label ?? item.name}
              </span>
              <span className="font-mono font-medium text-foreground">
                {Number(item.value ?? 0).toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
