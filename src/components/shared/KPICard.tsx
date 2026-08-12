import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

type KPITrend = {
  value: string;
  direction: "up" | "down" | "flat";
};

type KPICardProps = {
  title: string;
  value: string;
  icon: LucideIcon;
  color: "indigo" | "green" | "amber" | "rose";
  description: string;
  trend?: KPITrend;
};

const colorStyles: Record<KPICardProps["color"], string> = {
  indigo: "border-l-indigo-600 bg-indigo-50/40 text-indigo-700",
  green: "border-l-emerald-600 bg-emerald-50/50 text-emerald-700",
  amber: "border-l-amber-500 bg-amber-50/50 text-amber-700",
  rose: "border-l-rose-500 bg-rose-50/50 text-rose-700",
};

export function KPICard({ title, value, icon: Icon, color, description, trend }: KPICardProps) {
  return (
    <article
      className={cn(
        "rounded-xl border border-zinc-200 border-l-4 bg-white p-4 shadow-sm transition hover:shadow-md",
        colorStyles[color]
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-white shadow-sm">
          <Icon className="size-5" />
        </span>
      </div>

      <p className="mb-2 text-3xl font-bold tracking-tight text-zinc-900">{value}</p>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{description}</p>
        {trend ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
              trend.direction === "up" && "bg-emerald-100 text-emerald-700",
              trend.direction === "down" && "bg-rose-100 text-rose-700",
              trend.direction === "flat" && "bg-zinc-100 text-zinc-600"
            )}
          >
            {trend.direction === "up" ? (
              <TrendingUp className="size-3" />
            ) : trend.direction === "down" ? (
              <TrendingDown className="size-3" />
            ) : null}
            {trend.value}
          </span>
        ) : null}
      </div>
    </article>
  );
}
