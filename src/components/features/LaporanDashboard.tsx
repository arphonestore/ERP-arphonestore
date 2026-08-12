"use client";

import { Filter, Package2, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LaporanExport } from "@/components/laporan-export";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah, formatTanggal } from "@/lib/format";
import type { StockOut } from "@/types";

type PeriodeFilter = "today" | "month" | "custom";

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00`);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toPeriodeLabel(filter: PeriodeFilter, startDate: string, endDate: string) {
  if (filter === "today") {
    return "Hari Ini";
  }

  if (filter === "month") {
    const now = new Date();
    return now.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  }

  if (!startDate || !endDate) {
    return "Custom Range";
  }

  return `${formatTanggal(startDate)} - ${formatTanggal(endDate)}`;
}

export function LaporanDashboard() {
  const today = useMemo(() => new Date(), []);
  const [rows, setRows] = useState<StockOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodeFilter, setPeriodeFilter] = useState<PeriodeFilter>("month");
  const [customStartDate, setCustomStartDate] = useState(toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [customEndDate, setCustomEndDate] = useState(toIsoDate(today));

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/stock-out", { cache: "no-store" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "Gagal memuat data laporan." }))) as {
        message?: string;
      };
      setError(payload.message ?? "Gagal memuat data laporan.");
      setLoading(false);
      return;
    }

    const data = (await response.json()) as StockOut[];
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadRows();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endToday = new Date(startToday);
    endToday.setDate(endToday.getDate() + 1);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    return rows.filter((row) => {
      const rowDate = toDateOnly(row.tanggal_keluar);

      if (Number.isNaN(rowDate.getTime())) {
        return false;
      }

      if (periodeFilter === "today") {
        return rowDate >= startToday && rowDate < endToday;
      }

      if (periodeFilter === "month") {
        return rowDate >= monthStart && rowDate < nextMonthStart;
      }

      if (!customStartDate || !customEndDate) {
        return false;
      }

      const customStart = toDateOnly(customStartDate);
      const customEnd = toDateOnly(customEndDate);
      customEnd.setDate(customEnd.getDate() + 1);

      return rowDate >= customStart && rowDate < customEnd;
    });
  }, [rows, periodeFilter, customStartDate, customEndDate, today]);

  const summary = useMemo(() => {
    const totalModal = filteredRows.reduce((sum, row) => sum + Number(row.harga_modal ?? 0), 0);
    const totalJual = filteredRows.reduce((sum, row) => sum + Number(row.harga_jual ?? 0), 0);
    const totalKeuntungan = filteredRows.reduce((sum, row) => sum + Number(row.keuntungan ?? 0), 0);

    return {
      totalTransaksi: filteredRows.length,
      totalModal,
      totalJual,
      totalKeuntungan,
    };
  }, [filteredRows]);

  const periodeLabel = useMemo(
    () => toPeriodeLabel(periodeFilter, customStartDate, customEndDate),
    [periodeFilter, customStartDate, customEndDate]
  );

  const exportFileName = useMemo(() => {
    const slugPeriode =
      periodeFilter === "today"
        ? "hari-ini"
        : periodeFilter === "month"
          ? "bulan-ini"
          : `${customStartDate || "mulai"}-${customEndDate || "selesai"}`;

    return `laporan-transaksi-keluar-${slugPeriode}`;
  }, [periodeFilter, customStartDate, customEndDate]);

  const generatedAt = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const exportRows = useMemo(() => {
    return filteredRows.map((row) => ({
      tanggal: row.tanggal_keluar,
      type: row.type,
      imei: row.imei,
      pembeli: row.pembeli,
      modal: Number(row.harga_modal ?? 0),
      jual: Number(row.harga_jual ?? 0),
      profit: Number(row.keuntungan ?? 0),
    }));
  }, [filteredRows]);

  return (
    <div className="grid min-w-0 gap-5 overflow-x-clip">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Laporan</h1>
          <p className="text-muted-foreground text-sm">Laporan transaksi barang keluar dengan export PDF per periode.</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <LaporanExport
            fileName={exportFileName}
            periodeLabel={periodeLabel}
            totalItem={summary.totalTransaksi}
            totalModal={summary.totalModal}
            totalJual={summary.totalJual}
            totalProfit={summary.totalKeuntungan}
            rows={exportRows}
            disabled={loading || filteredRows.length === 0}
          />
        </div>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4" /> Filter Periode
          </CardTitle>
          <CardDescription>Pilih kategori laporan: Hari Ini, Bulan Ini, atau Custom Range Tanggal.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="grid min-w-0 gap-2 col-span-2 lg:col-span-1">
            <Label htmlFor="filterPeriode">Kategori Periode</Label>
            <Select
              triggerId="filterPeriode"
              value={periodeFilter}
              onValueChange={(value) => setPeriodeFilter(value as PeriodeFilter)}
              options={[
                { value: "today", label: "Hari Ini" },
                { value: "month", label: "Bulan Ini" },
                { value: "custom", label: "Custom Range" },
              ]}
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="customStartDate">Tanggal Mulai</Label>
            <DatePicker
              id="customStartDate"
              value={customStartDate}
              placeholder="Pilih tanggal mulai"
              disabled={periodeFilter !== "custom"}
              onChange={setCustomStartDate}
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="customEndDate">Tanggal Akhir</Label>
            <DatePicker
              id="customEndDate"
              value={customEndDate}
              placeholder="Pilih tanggal akhir"
              disabled={periodeFilter !== "custom"}
              onChange={setCustomEndDate}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Periode Aktif</p>
            <p className="mt-1 text-sm font-medium">{periodeLabel}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-5 overflow-x-clip rounded-xl bg-white p-4 dark:bg-zinc-900">
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">AR Store</p>
              <p className="text-sm text-muted-foreground">Laporan Transaksi Barang Keluar</p>
            </div>

            <div className="text-sm sm:text-right">
              <p>
                Periode: <span className="font-semibold">{periodeLabel}</span>
              </p>
              <p className="text-muted-foreground">Dicetak: {generatedAt}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 *:min-w-0">
          <Card className="min-w-0 p-4 sm:p-5">
            <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:flex md:flex-col md:items-start md:gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Package2 className="size-4" /> Total Item
              </p>
              <p className="text-right text-xl font-semibold leading-none md:text-left">{summary.totalTransaksi}</p>
            </div>
          </Card>

          <Card className="min-w-0 p-4 sm:p-5">
            <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:flex md:flex-col md:items-start md:gap-2">
              <p className="text-sm font-medium text-muted-foreground">Total Modal</p>
              <p className="text-right text-xl font-semibold leading-none md:text-left">{formatRupiah(summary.totalModal)}</p>
            </div>
          </Card>

          <Card className="min-w-0 p-4 sm:p-5">
            <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:flex md:flex-col md:items-start md:gap-2">
              <p className="text-sm font-medium text-muted-foreground">Total Penjualan</p>
              <p className="text-right text-xl font-semibold leading-none md:text-left">{formatRupiah(summary.totalJual)}</p>
            </div>
          </Card>

          <Card className="min-w-0 p-4 sm:p-5">
            <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:flex md:flex-col md:items-start md:gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Wallet className="size-4" /> Total Keuntungan
              </p>
              <p className="text-right text-xl font-semibold leading-none text-emerald-600 dark:text-emerald-400 md:text-left">{formatRupiah(summary.totalKeuntungan)}</p>
            </div>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Data Transaksi Keluar</CardTitle>
            <CardDescription>Data sesuai periode export: {periodeLabel}</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 px-0 sm:px-6">
            <div className="scrollbar-AR overflow-x-auto px-3 sm:px-0">
              <Table className="min-w-full md:min-w-220">
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>IMEI</TableHead>
                  <TableHead>Pembeli</TableHead>
                  <TableHead>Modal</TableHead>
                  <TableHead>Jual</TableHead>
                  <TableHead>Keuntungan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Memuat data laporan...
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-destructive">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Tidak ada transaksi keluar pada periode ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-36 truncate whitespace-nowrap">{formatTanggal(row.tanggal_keluar)}</TableCell>
                      <TableCell className="max-w-36 truncate whitespace-nowrap">{row.type}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono">{row.imei}</TableCell>
                      <TableCell className="max-w-36 truncate whitespace-nowrap">{row.pembeli}</TableCell>
                      <TableCell className="max-w-36 truncate whitespace-nowrap">{formatRupiah(Number(row.harga_modal ?? 0))}</TableCell>
                      <TableCell className="max-w-36 truncate whitespace-nowrap">{formatRupiah(Number(row.harga_jual ?? 0))}</TableCell>
                      <TableCell className="max-w-36 truncate whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatRupiah(Number(row.keuntungan ?? 0))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
