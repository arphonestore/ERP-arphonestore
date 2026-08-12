"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = {
  [k: string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a ChartContainer.");
  }

  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [isContainerReady, setIsContainerReady] = React.useState(false);

  React.useEffect(() => {
    const node = containerRef.current;

    if (!node) {
      return;
    }

    const updateReadyState = () => {
      const { width, height } = node.getBoundingClientRect();
      setIsContainerReady(width > 0 && height > 0);
    };

    updateReadyState();

    const observer = new ResizeObserver(() => {
      updateReadyState();
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={containerRef}
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "min-w-0 [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-tooltip-cursor]:stroke-border [&_.recharts-reference-line_line]:stroke-border [&_.recharts-sector]:outline-none [&_.recharts-bar-rectangle]:outline-none",
          className
        )}
        style={Object.fromEntries(
          Object.entries(config).map(([key, itemConfig]) => [`--color-${key}`, itemConfig.color ?? "currentColor"])
        ) as React.CSSProperties}
        {...props}
      >
        {isContainerReady ? (
          <RechartsPrimitive.ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            {children}
          </RechartsPrimitive.ResponsiveContainer>
        ) : (
          <div className="h-full w-full" />
        )}
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type ChartTooltipRow = {
  dataKey?: string | number;
  value?: unknown;
  name?: unknown;
  color?: string;
  payload?: unknown;
};

type ChartTooltipContentProps = {
  active?: boolean;
  payload?: ChartTooltipRow[];
  label?: unknown;
  hideLabel?: boolean;
  formatter?: (
    value: unknown,
    name: unknown,
    item: ChartTooltipRow,
    index: number,
    payload: unknown
  ) => React.ReactNode | [React.ReactNode, React.ReactNode];
  labelFormatter?: (label: unknown, payload: ChartTooltipRow[]) => React.ReactNode;
};

function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  formatter,
  labelFormatter,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {!hideLabel ? (
        <p className="font-medium text-foreground">
          {labelFormatter ? String(labelFormatter(label, payload)) : String(label ?? "")}
        </p>
      ) : null}
      <div className="grid gap-1">
        {payload.map((item, index) => {
          const key = String(item.dataKey ?? "");
          const itemConfig = config[key];
          const formatted = formatter?.(item.value, item.name, item, index, item.payload);

          const parsedValue = Array.isArray(formatted)
            ? String(formatted[0] ?? "-")
            : String(item.value ?? "-");

          const parsedLabel = Array.isArray(formatted)
            ? String(formatted[1] ?? itemConfig?.label ?? key)
            : String(itemConfig?.label ?? key);

          return (
            <div key={`${key}-${index}`} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="size-2 rounded-xs"
                  style={{ backgroundColor: item.color ?? `var(--color-${key})` }}
                />
                <span>{parsedLabel}</span>
              </div>
              <span className="font-medium text-foreground">{parsedValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
