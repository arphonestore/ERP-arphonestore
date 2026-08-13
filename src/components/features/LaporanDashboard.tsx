"use client";

import { format } from "date-fns";
import { AlertTriangle, Filter, Package2, RefreshCcw, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LaporanExport, type LaporanExportSnapshot } from "@/components/laporan-export";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import type { StockOut } from "@/types";

type PeriodeFilter = "today" | "month" | "custom";

const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const MAX_SNAPSHOT_AGE_MS = 5 * 60_000;

function toDateOnly(value: string) {
  const dateOnly = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

function formatDateOnly(value: string) {
  const dateOnly = toDateOnly(value);
  if (!dateOnly) return value;

  const [year, month, day] = dateOnly.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(parsed);
}

function formatJakartaTimestamp(value: Date) {
  return `${new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value)} WIB`;
}

function getCustomRangeError(filter: PeriodeFilter, startDate: string, endDate: string) {
  if (filter !== "custom") return null;
  if (!startDate || !endDate) return "Tanggal mulai dan tanggal akhir wajib dipilih.";
  if (startDate > endDate) return "Tanggal mulai tidak boleh setelah tanggal akhir.";
  return null;
}

function reportRange(
  filter: PeriodeFilter,
  startDate: string,
  endDate: string,
  referenceDate = new Date()
) {
  if (filter === "today") {
    const today = format(referenceDate, "yyyy-MM-dd");
    return { from: today, to: today };
  }

  if (filter === "month") {
    return {
      from: format(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1), "yyyy-MM-dd"),
      to: format(new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0), "yyyy-MM-dd"),
    };
  }

  return { from: startDate, to: endDate };
}

function summarizeRows(sourceRows: StockOut[]) {
  return sourceRows.reduce(
    (summary, row) => ({
      totalTransaksi: summary.totalTransaksi + 1,
      totalModal: summary.totalModal + Number(row.harga_modal ?? 0),
      totalJual: summary.totalJual + Number(row.harga_jual ?? 0),
      totalKeuntungan: summary.totalKeuntungan + Number(row.keuntungan ?? 0),
    }),
    { totalTransaksi: 0, totalModal: 0, totalJual: 0, totalKeuntungan: 0 }
  );
}

function toPeriodeLabel(filter: PeriodeFilter, startDate: string, endDate: string) {
  if (filter === "today") return "Hari Ini";

  if (filter === "month") {
    return new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  }

  if (!startDate || !endDate) return "Custom Range";
  return `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}`;
}

function toExportFileName(filter: PeriodeFilter, startDate: string, endDate: string) {
  const slugPeriode =
    filter === "today"
      ? "hari-ini"
      : filter === "month"
        ? "bulan-ini"
        : `${startDate || "mulai"}-${endDate || "selesai"}`;

  return `laporan-transaksi-keluar-${slugPeriode}`;
}

function toExportRows(sourceRows: StockOut[]) {
  return sourceRows.map((row) => ({
    tanggal: row.tanggal_keluar,
    type: row.type,
    imei: row.imei,
    pembeli: row.pembeli,
    modal: Number(row.harga_modal ?? 0),
    jual: Number(row.harga_jual ?? 0),
    profit: Number(row.keuntungan ?? 0),
  }));
}

export function LaporanDashboard() {
  const initialDate = useMemo(() => new Date(), []);
  const [rows, setRows] = useState<StockOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [ageTick, setAgeTick] = useState(() => Date.now());
  const [periodeFilter, setPeriodeFilter] = useState<PeriodeFilter>("month");
  const [customStartDate, setCustomStartDate] = useState(format(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1), "yyyy-MM-dd"));
  const [customEndDate, setCustomEndDate] = useState(format(initialDate, "yyyy-MM-dd"));
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);

  const loadRows = useCallback(async (showLoading = true): Promise<{ rows: StockOut[]; loadedAt: Date } | null> => {
    const requestId = ++requestSequenceRef.current;
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (showLoading) setLoading(true);
    setError(null);

    try {
      const range = reportRange(periodeFilter, customStartDate, customEndDate);
      if (!range.from || !range.to || range.from > range.to) {
        setError("Perbaiki rentang tanggal sebelum memuat laporan.");
        return null;
      }

      const params = new URLSearchParams({ from: range.from, to: range.to });
      const response = await fetch(`/api/stock-out?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ message: "Gagal memuat data laporan." }))) as {
          message?: string;
        };
        throw new Error(payload.message ?? "Gagal memuat data laporan.");
      }

      const data = (await response.json()) as StockOut[];
      const loadedAt = new Date();

      if (requestId !== requestSequenceRef.current) return null;

      setRows(data);
      setLastLoadedAt(loadedAt);
      setAgeTick(loadedAt.getTime());
      return { rows: data, loadedAt };
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== requestSequenceRef.current) return null;

      setError(loadError instanceof Error ? loadError.message : "Gagal memuat data laporan. Periksa koneksi lalu coba lagi.");
      return null;
    } finally {
      if (requestId === requestSequenceRef.current) setLoading(false);
    }
  }, [customEndDate, customStartDate, periodeFilter]);

  useEffect(() => {
    const timerId = window.setTimeout(() => void loadRows(), 0);
    const ageIntervalId = window.setInterval(() => setAgeTick(Date.now()), 60_000);

    return () => {
      window.clearTimeout(timerId);
      window.clearInterval(ageIntervalId);
      abortControllerRef.current?.abort();
    };
  }, [loadRows]);

  const customRangeError = getCustomRangeError(periodeFilter, customStartDate, customEndDate);
  const filteredRows = useMemo(() => (customRangeError ? [] : rows), [customRangeError, rows]);
  const summary = useMemo(() => summarizeRows(filteredRows), [filteredRows]);
  const periodeLabel = useMemo(
    () => toPeriodeLabel(periodeFilter, customStartDate, customEndDate),
    [periodeFilter, customStartDate, customEndDate]
  );
  const exportFileName = useMemo(
    () => toExportFileName(periodeFilter, customStartDate, customEndDate),
    [periodeFilter, customStartDate, customEndDate]
  );
  const exportRows = useMemo(() => toExportRows(filteredRows), [filteredRows]);
  const snapshotIsStale = Boolean(lastLoadedAt && ageTick - lastLoadedAt.getTime() > MAX_SNAPSHOT_AGE_MS);

  const prepareExport = useCallback(async (): Promise<LaporanExportSnapshot | null> => {
    if (getCustomRangeError(periodeFilter, customStartDate, customEndDate)) return null;

    const freshResult = await loadRows(false);
    if (!freshResult) return null;

    const freshFilteredRows = freshResult.rows;
    const freshSummary = summarizeRows(freshFilteredRows);

    return {
      fileName: toExportFileName(periodeFilter, customStartDate, customEndDate),
      periodeLabel: toPeriodeLabel(periodeFilter, customStartDate, customEndDate),
      totalItem: freshSummary.totalTransaksi,
      totalModal: freshSummary.totalModal,
      totalJual: freshSummary.totalJual,
      totalProfit: freshSummary.totalKeuntungan,
      rows: toExportRows(freshFilteredRows),
      loadedAt: freshResult.loadedAt,
    };
  }, [customEndDate, customStartDate, loadRows, periodeFilter]);

  return (
    <div className="grid min-w-0 gap-5 overflow-x-clip">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Laporan</h1>
          <p className="text-sm text-muted-foreground">Laporan transaksi barang keluar dengan export PDF per periode.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lastLoadedAt ? `Data terakhir dimuat ${formatJakartaTimestamp(lastLoadedAt)}` : "Data belum berhasil dimuat."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => void loadRows()} disabled={loading}>
            <RefreshCcw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Muat Ulang
          </Button>
          <LaporanExport
            fileName={exportFileName}
            periodeLabel={periodeLabel}
            totalItem={summary.totalTransaksi}
            totalModal={summary.totalModal}
            totalJual={summary.totalJual}
            totalProfit={summary.totalKeuntungan}
            rows={exportRows}
            loadedAt={lastLoadedAt}
            maxSnapshotAgeMs={MAX_SNAPSHOT_AGE_MS}
            onPrepareExport={prepareExport}
            disabled={!lastLoadedAt || Boolean(customRangeError) || filteredRows.length === 0}
          />
        </div>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3" role="alert">
          <AlertTriangle className="size-4 text-destructive" />
          <p className="min-w-0 flex-1 text-sm text-destructive">
            {error}{lastLoadedAt ? " Data terakhir tetap ditampilkan." : ""}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
            Coba Lagi
          </Button>
        </div>
      ) : null}

      {snapshotIsStale ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200" role="status">
          Snapshot layar berusia lebih dari 5 menit. Export akan memuat data terbaru terlebih dahulu dan dibatalkan jika refresh gagal.
        </div>
      ) : null}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4" /> Filter Periode
          </CardTitle>
          <CardDescription>Pilih kategori laporan: Hari Ini, Bulan Ini, atau Custom Range Tanggal.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="col-span-2 grid min-w-0 gap-2 lg:col-span-1">
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

          <div className="col-span-2 rounded-lg border border-border bg-muted/40 p-3 lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Periode Aktif</p>
            <p className="mt-1 text-sm font-medium">{periodeLabel}</p>
          </div>

          {customRangeError ? (
            <p className="col-span-2 text-sm text-destructive lg:col-span-4" role="alert">{customRangeError}</p>
          ) : null}
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
              <p>Periode: <span className="font-semibold">{periodeLabel}</span></p>
              <p className="text-muted-foreground">
                Snapshot: {lastLoadedAt ? formatJakartaTimestamp(lastLoadedAt) : "Belum tersedia"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 *:min-w-0">
          <Card className="min-w-0 p-4 sm:p-5">
            <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:flex md:flex-col md:items-start md:gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Package2 className="size-4" /> Total Item</p>
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
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Wallet className="size-4" /> Laba Kotor</p>
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
                    <TableHead>Laba Kotor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && !lastLoadedAt ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Memuat data laporan...</TableCell></TableRow>
                  ) : !lastLoadedAt ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-destructive">Data belum berhasil dimuat. Gunakan tombol Coba Lagi.</TableCell></TableRow>
                  ) : customRangeError ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-destructive">Perbaiki rentang tanggal untuk menampilkan laporan.</TableCell></TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Tidak ada transaksi keluar pada periode ini.</TableCell></TableRow>
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-36 truncate whitespace-nowrap">{formatDateOnly(row.tanggal_keluar)}</TableCell>
                        <TableCell className="max-w-36 truncate whitespace-nowrap">{row.type}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono">{row.imei}</TableCell>
                        <TableCell className="max-w-36 truncate whitespace-nowrap">{row.pembeli}</TableCell>
                        <TableCell className="max-w-36 truncate whitespace-nowrap">{formatRupiah(Number(row.harga_modal ?? 0))}</TableCell>
                        <TableCell className="max-w-36 truncate whitespace-nowrap">{formatRupiah(Number(row.harga_jual ?? 0))}</TableCell>
                        <TableCell className="max-w-36 truncate whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">{formatRupiah(Number(row.keuntungan ?? 0))}</TableCell>
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
