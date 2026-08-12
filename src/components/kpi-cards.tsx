import { Box, DollarSign, LogIn, LogOut } from "lucide-react";

import { KPICard } from "@/components/shared/KPICard";
import { formatRupiah } from "@/lib/format";
import type { KpiSummary } from "@/lib/types";

type KpiCardsProps = {
  data: KpiSummary;
};

export function KpiCards({ data }: KpiCardsProps) {
  const cards = [
    {
      title: "Total Stock",
      value: data.total_stock.toString(),
      description: "Unit siap jual",
      icon: Box,
      color: "indigo" as const,
      trend: { value: "+4.3%", direction: "up" as const },
    },
    {
      title: "Total Masuk",
      value: data.total_masuk.toString(),
      description: "Transaksi barang masuk",
      icon: LogIn,
      color: "amber" as const,
      trend: { value: "+2.1%", direction: "up" as const },
    },
    {
      title: "Total Keluar",
      value: data.total_keluar.toString(),
      description: "Transaksi barang keluar",
      icon: LogOut,
      color: "rose" as const,
      trend: { value: "-0.8%", direction: "down" as const },
    },
    {
      title: "Total Keuntungan",
      value: formatRupiah(data.total_keuntungan),
      description: "Akumulasi laba periode aktif",
      icon: DollarSign,
      color: "green" as const,
      trend: { value: "+8.9%", direction: "up" as const },
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        return (
          <KPICard
            key={card.title}
            title={card.title}
            value={card.value}
            icon={card.icon}
            color={card.color}
            description={card.description}
            trend={card.trend}
          />
        );
      })}
    </div>
  );
}
