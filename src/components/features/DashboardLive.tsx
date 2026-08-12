"use client";

import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ArrowDown, ArrowUp, Box, ChartColumnBig, CircleDollarSign, TrendingUp, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, PolarAngleAxis, RadialBar, RadialBarChart, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah, formatTanggal } from "@/lib/format";
import type { StockOut } from "@/types";

type DashboardPeriodOption = {
  key: string;
  year: number;
  month: number;
  label: string;
};

type DashboardPayload = {
  period: {
    from: string;
    to: string;
  };
  selectedPeriod: DashboardPeriodOption | null;
  availablePeriods: DashboardPeriodOption[];
  kpi: {
    total_stock: number;
    total_masuk: number;
    total_keluar: number;
    total_omzet: number;
    omzet_periode: number;
    profit_bersih_periode: number;
    modal_putar_periode: number;
    modal_periode: number;
    profit_roi_persen: number;
    profit_bulan_lalu: number;
    profit_perubahan_persen: number;
    profit_tren: "up" | "down" | "flat";
  };
  chartSeries: {
    tanggal: string;
    omzet: number;
    profit: number;
    transaksi: number;
  }[];
  recentStockOut: StockOut[];
};

const chartConfig = {
  omzet: {
    label: "Omzet",
    color: "#018d8a",
  },
  profit: {
    label: "Profit",
    color: "#0cbab7",
  },
} satisfies ChartConfig;

const transaksiChartConfig = {
  masuk: {
    label: "Barang Masuk",
    color: "#3b82f6",
  },
  keluar: {
    label: "Barang Keluar",
    color: "#ef4444",
  },
} satisfies ChartConfig;

type DashboardLiveProps = {
  dateRange?: DateRange;
};

export function DashboardLive({ dateRange }: DashboardLiveProps) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [periods, setPeriods] = useState<DashboardPeriodOption[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const [chartReady, setChartReady] = useState(false);

  const fromParam = useMemo(() => {
    if (dateRange?.from) {
      return format(dateRange.from, "yyyy-MM-dd");
    }

    const fallbackMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return format(fallbackMonthStart, "yyyy-MM-dd");
  }, [dateRange]);

  const toParam = useMemo(() => {
    if (dateRange?.to) {
      return format(dateRange.to, "yyyy-MM-dd");
    }

    if (dateRange?.from) {
      return format(dateRange.from, "yyyy-MM-dd");
    }

    return format(new Date(), "yyyy-MM-dd");
  }, [dateRange]);

  const hasExternalRange = Boolean(dateRange?.from || dateRange?.to);

  const loadDashboard = useCallback(async (showLoading: boolean, explicitRange?: { from: string; to: string }) => {
    if (showLoading) {
      setLoading(true);
    }

    setError(null);

    const fromValue = explicitRange?.from ?? (hasExternalRange ? fromParam : undefined);
    const toValue = explicitRange?.to ?? (hasExternalRange ? toParam : undefined);
    const params = new URLSearchParams();

    if (fromValue) {
      params.set("from", fromValue);
    }

    if (toValue) {
      params.set("to", toValue);
    }

    const query = params.toString();
    const response = await fetch(`/api/dashboard${query ? `?${query}` : ""}`, { cache: "no-store" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "Gagal memuat dashboard." }))) as {
        message?: string;
      };
      setError(payload.message ?? "Gagal memuat dashboard.");
      setLoading(false);
      return;
    }

    const payload = (await response.json()) as DashboardPayload;
    setData(payload);
    setPeriods(payload.availablePeriods ?? []);

    if (payload.selectedPeriod) {
      setSelectedYear((prev) => prev || String(payload.selectedPeriod?.year));
      setSelectedMonth((prev) => prev || String(payload.selectedPeriod?.month));
    }

    setLoading(false);
  }, [fromParam, hasExternalRange, toParam]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadDashboard(true);
    }, 0);

    const intervalId = window.setInterval(() => {
      void loadDashboard(false);
    }, 30_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [loadDashboard]);

  useEffect(() => {
    const node = chartHostRef.current;

    if (!node) {
      return;
    }

    const updateReady = () => {
      const { width, height } = node.getBoundingClientRect();
      setChartReady(width > 0 && height > 0);
    };

    updateReady();

    const observer = new ResizeObserver(() => {
      updateReady();
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [data?.chartSeries.length]);

  const yearOptions = useMemo(() => {
    const uniqueYears = [...new Set(periods.map((item) => item.year))].sort((a, b) => b - a);

    return uniqueYears.map((year) => ({
      value: String(year),
      label: String(year),
    }));
  }, [periods]);

  const monthOptions = useMemo(() => {
    if (!selectedYear) {
      return [];
    }

    const targetYear = Number(selectedYear);

    return periods
      .filter((item) => item.year === targetYear)
      .sort((a, b) => b.month - a.month)
      .map((item) => ({
        value: String(item.month),
        label: item.label,
      }));
  }, [periods, selectedYear]);

  async function applyPeriodFilter(yearValue: string, monthValue: string) {
    const year = Number(yearValue);
    const month = Number(monthValue);

    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return;
    }

    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to = format(new Date(year, month, 0), "yyyy-MM-dd");
    await loadDashboard(true, { from, to });
  }

  function handleYearChange(nextYear: string) {
    setSelectedYear(nextYear);

    const targetYear = Number(nextYear);
    const firstAvailableMonth = periods
      .filter((item) => item.year === targetYear)
      .sort((a, b) => b.month - a.month)[0];

    if (!firstAvailableMonth) {
      setSelectedMonth("");
      return;
    }

    const monthText = String(firstAvailableMonth.month);
    setSelectedMonth(monthText);
    void applyPeriodFilter(nextYear, monthText);
  }

  function handleMonthChange(nextMonth: string) {
    setSelectedMonth(nextMonth);

    if (!selectedYear) {
      return;
    }

    void applyPeriodFilter(selectedYear, nextMonth);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Memuat data dashboard...</p>;
  }

  if (error || !data) {
    return <p className="text-sm text-destructive">{error ?? "Data dashboard tidak tersedia."}</p>;
  }

  const totalTransaksi = data.kpi.total_masuk + data.kpi.total_keluar;
  const profitChangeAbs = Math.abs(data.kpi.profit_perubahan_persen);
  const profitTrend = data.kpi.profit_tren;
  const isProfitUp = profitTrend === "up";
  const isProfitDown = profitTrend === "down";
  const profitTrendText =
    profitTrend === "flat" ? "Profit stabil dibanding bulan lalu." : `${profitChangeAbs.toFixed(1)}% dibanding bulan lalu`;
  const profitTrendColorClass = isProfitUp
    ? "text-emerald-600 dark:text-emerald-400"
    : isProfitDown
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";
  const profitRoiText = `${data.kpi.profit_roi_persen.toFixed(1)}%`;

  const radialTransaksiData = [
    {
      name: "transaksi",
      masuk: data.kpi.total_masuk,
      keluar: data.kpi.total_keluar,
      total: Math.max(totalTransaksi, 1),
    },
  ];

  return (
    <div className="grid min-w-0 gap-4 overflow-x-clip sm:gap-5">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Filter Data Bulanan</CardTitle>
          <CardDescription>Pilih bulan dan tahun berdasarkan data yang tersedia.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="dashboardYearFilter">Tahun</Label>
            <Select
              triggerId="dashboardYearFilter"
              value={selectedYear}
              onValueChange={handleYearChange}
              options={yearOptions}
              placeholder="Pilih tahun"
              disabled={yearOptions.length === 0}
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="dashboardMonthFilter">Bulan</Label>
            <Select
              triggerId="dashboardMonthFilter"
              value={selectedMonth}
              onValueChange={handleMonthChange}
              options={monthOptions}
              placeholder="Pilih bulan"
              disabled={!selectedYear || monthOptions.length === 0}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 *:min-w-0">
        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:flex sm:flex-col sm:items-start sm:gap-2">
            <div className="col-start-1 row-start-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Box className="size-4" /> Stok Tersedia
            </div>
            <div className="col-start-2 row-span-2 row-start-1 text-right text-2xl font-bold tracking-tight sm:text-left sm:text-3xl">
              {data.kpi.total_stock}
            </div>
            <div className="col-start-1 row-start-2 text-xs text-muted-foreground">
              Unit siap jual saat ini.
            </div>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:flex sm:flex-col sm:items-start sm:gap-2">
            <div className="col-start-1 row-start-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CircleDollarSign className="size-4" /> Omzet Periode
            </div>
            <div className="col-start-2 row-span-2 row-start-1 text-right text-lg font-bold leading-snug tracking-tight sm:text-left sm:text-2xl">
              {formatRupiah(data.kpi.omzet_periode)}
            </div>
            <div className="col-start-1 row-start-2 text-xs text-muted-foreground">
              Total penjualan periode terpilih.
            </div>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:flex sm:flex-col sm:items-start sm:gap-2">
            <div className="col-start-1 row-start-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="size-4" /> Profit Bersih
            </div>
            <div className="col-start-2 row-span-2 row-start-1 text-right text-lg font-bold leading-snug tracking-tight text-emerald-600 dark:text-emerald-400 sm:text-left sm:text-2xl">
              {formatRupiah(data.kpi.profit_bersih_periode)}
            </div>
            <div className={`col-start-1 row-start-2 flex items-center gap-1.5 text-xs ${profitTrendColorClass}`}>
              {isProfitUp ? <ArrowUp className="size-3.5" /> : null}
              {isProfitDown ? <ArrowDown className="size-3.5" /> : null}
              <span>ROI {profitRoiText} • {profitTrendText}</span>
            </div>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:flex sm:flex-col sm:items-start sm:gap-2">
            <div className="col-start-1 row-start-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="size-4" /> Modal + Profit
            </div>
            <div className="col-start-2 row-span-2 row-start-1 text-right text-lg font-bold leading-snug tracking-tight sm:text-left sm:text-2xl">
              {formatRupiah(data.kpi.modal_periode)}
            </div>
            <div className="col-start-1 row-start-2 text-xs text-muted-foreground">
              Modal putar & profit periode.
            </div>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:flex sm:flex-col sm:items-start sm:gap-2">
            <div className="col-start-1 row-start-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CircleDollarSign className="size-4" /> Omzet Tahun Ini
            </div>
            <div className="col-start-2 row-span-2 row-start-1 text-right text-lg font-bold leading-snug tracking-tight sm:text-left sm:text-2xl">
              {formatRupiah(data.kpi.total_omzet)}
            </div>
            <div className="col-start-1 row-start-2 text-xs text-muted-foreground">
              Total penjualan pada tahun berjalan.
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] *:min-w-0">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Barang Masuk vs Keluar
            </CardTitle>
            <CardDescription>Perbandingan transaksi masuk dan keluar pada periode terpilih.</CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-4 sm:px-5 sm:pb-5">
            {totalTransaksi === 0 ? (
              <p className="text-muted-foreground text-xs">Belum ada transaksi pada periode ini.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="mx-auto w-full max-w-60 pt-4">
                  <ChartContainer config={transaksiChartConfig} className="aspect-2/1 w-full">
                    <RadialBarChart
                      data={radialTransaksiData}
                      startAngle={180}
                      endAngle={0}
                      innerRadius="52%"
                      outerRadius="170%"
                      cx="50%"
                      cy="100%"
                    >
                      <PolarAngleAxis type="number" domain={[0, radialTransaksiData[0].total]} tick={false} axisLine={false} />
                      <RadialBar
                        dataKey="masuk"
                        stackId="a"
                        fill="var(--color-masuk)"
                        cornerRadius={6}
                      />
                      <RadialBar
                        dataKey="keluar"
                        stackId="a"
                        fill="var(--color-keluar)"
                        cornerRadius={6}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            formatter={( value, name) => {
                              return [
                                `${value} Transaksi`,
                                name === "masuk" ? "Masuk" : "Keluar",
                              ];
                            }}
                          />
                        }
                      />
                    </RadialBarChart>
                  </ChartContainer>
                </div>
                <div className="grid grid-cols-1 gap-1.5 text-xs">
                  <div className="rounded-lg border border-border p-2.5">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="size-2 rounded-full bg-(--color-masuk)" />
                      Masuk : <span className="text-base font-semibold text-foreground">{data.kpi.total_masuk}</span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-border p-2.5">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="size-2 rounded-full bg-(--color-keluar)" />
                      Keluar : <span className="text-base font-semibold text-foreground">{data.kpi.total_keluar}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ChartColumnBig className="size-4" /> Grafik Omzet & Profit Periode
            </CardTitle>
            <CardDescription>Visualisasi berdasarkan tanggal pada periode terpilih (auto refresh 30 detik).</CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-4 sm:px-5 sm:pb-5">
            {data.chartSeries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada data transaksi untuk ditampilkan.</p>
            ) : (
              <div ref={chartHostRef} className="min-h-64 w-full max-w-full overflow-hidden sm:min-h-72">
                <div className="min-w-0">
                  {chartReady ? (
                    <ChartContainer config={chartConfig} className="h-64 w-full sm:h-72">
                      <BarChart accessibilityLayer data={data.chartSeries}>
                        <XAxis
                          dataKey="tanggal"
                          tickLine={false}
                          tickMargin={8}
                          axisLine={false}
                          tickFormatter={(value) => {
                            return new Date(value as string).toLocaleDateString("id-ID", {
                              day: "2-digit",
                            });
                          }}
                        />
                        <Bar
                          dataKey="omzet"
                          stackId="a"
                          fill="var(--color-omzet)"
                          radius={[0, 0, 4, 4]}
                        />
                        <Bar
                          dataKey="profit"
                          stackId="a"
                          fill="var(--color-profit)"
                          radius={[4, 4, 0, 0]}
                        />
                        <ChartTooltip
                          cursor={false}
                          content={
                            <ChartTooltipContent
                              labelFormatter={(value) => formatTanggal(String(value))}
                              formatter={(value, name) => {
                                return [
                                  formatRupiah(Number(value ?? 0)),
                                  name === "omzet" ? "Omzet" : "Profit",
                                ];
                              }}
                            />
                          }
                        />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <div className="h-64 w-full animate-pulse rounded-lg bg-muted/40 sm:h-72" />
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Riwayat Barang Keluar Terbaru</CardTitle>
          <CardDescription>Menampilkan hingga 15 transaksi terbaru dalam periode terpilih.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-5">
          <div className="scrollbar-AR overflow-x-auto px-3 sm:px-5">
            <Table className="min-w-full md:min-w-190">
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>IMEI</TableHead>
                <TableHead>Pembeli</TableHead>
                <TableHead>Harga Jual</TableHead>
                <TableHead>Keuntungan</TableHead>
                <TableHead>Tanggal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentStockOut.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-center">
                    Belum ada data barang keluar.
                  </TableCell>
                </TableRow>
              ) : (
                data.recentStockOut.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-36 truncate whitespace-nowrap">{item.type}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono">{item.imei}</TableCell>
                    <TableCell className="max-w-36 truncate whitespace-nowrap">{item.pembeli}</TableCell>
                    <TableCell className="max-w-36 truncate whitespace-nowrap">{formatRupiah(Number(item.harga_jual ?? 0))}</TableCell>
                    <TableCell className="max-w-36 truncate whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatRupiah(Number(item.keuntungan ?? 0))}
                    </TableCell>
                    <TableCell className="max-w-36 truncate whitespace-nowrap">{formatTanggal(item.tanggal_keluar)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
