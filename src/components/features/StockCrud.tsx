"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, PackageCheck, PackageMinus, PackagePlus, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import type { Stock } from "@/types";

type PeriodFilter = "all" | "today" | "week" | "month";

export function StockCrud() {
  const [rows, setRows] = useState<Stock[]>([]);
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stock?status=all", { cache: "no-store" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ message: "Gagal memuat stock." }))) as {
          message?: string;
        };
        throw new Error(payload.message ?? "Gagal memuat stock.");
      }

      const data = (await response.json()) as Stock[];
      setRows(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat stock. Periksa koneksi lalu coba lagi.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => void fetchRows(), 0);
    return () => window.clearTimeout(timerId);
  }, [fetchRows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const mondayOffset = (startOfToday.getDay() + 6) % 7;
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return rows.filter((row) => {
      const createdAt = new Date(row.created_at);
      const validDate = !Number.isNaN(createdAt.getTime());
      const matchesPeriod =
        periodFilter === "all"
          ? true
          : validDate &&
            (periodFilter === "today"
              ? createdAt >= startOfToday && createdAt < startOfTomorrow
              : periodFilter === "week"
                ? createdAt >= startOfWeek && createdAt < startOfTomorrow
                : createdAt >= startOfMonth && createdAt < startOfNextMonth);
      const matchesKeyword =
        !keyword || [row.type, row.imei, row.status, String(row.harga)].some((value) => value.toLowerCase().includes(keyword));

      return matchesPeriod && matchesKeyword;
    });
  }, [periodFilter, rows, search]);

  const totalFilteredRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredRows / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + rowsPerPage);
  const pageRangeStart = totalFilteredRows === 0 ? 0 : startIndex + 1;
  const pageRangeEnd = Math.min(startIndex + rowsPerPage, totalFilteredRows);

  const stats = useMemo(() => {
    const availableItems = filteredRows.filter((row) => row.status === "available").length;
    const totalAsset = filteredRows.reduce((sum, row) => sum + Number(row.harga), 0);
    const uniqueTypes = new Set(filteredRows.map((row) => row.type.trim().toLowerCase()).filter(Boolean)).size;

    return {
      totalItems: filteredRows.length,
      availableItems,
      totalAsset,
      uniqueTypes,
    };
  }, [filteredRows]);

  return (
    <div className="grid min-w-0 gap-5 overflow-x-clip">
      <section className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 font-semibold">
              <PackageCheck className="size-5 text-primary" /> Inventory baca-saja
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Stock tidak dapat dibuat, diubah, atau dihapus langsung. Tambahkan unit melalui Barang Masuk; keluarkan atau jual unit melalui Barang Keluar agar riwayat dan saldo inventory tetap konsisten.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/barang-masuk" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground">
              <PackagePlus className="size-4" /> Barang Masuk
            </Link>
            <Link href="/barang-keluar" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium">
              <PackageMinus className="size-4" /> Barang Keluar
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3" role="alert">
          <p className="min-w-0 flex-1 text-sm text-destructive">{error}{rows.length > 0 ? " Data terakhir tetap ditampilkan." : ""}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchRows()} disabled={loading}>
            <RefreshCcw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Coba Lagi
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 *:min-w-0">
        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 lg:flex lg:flex-col lg:items-start lg:gap-2">
            <p className="text-sm font-medium text-muted-foreground">Total Item</p>
            <p className="text-right text-2xl font-bold tracking-tight sm:text-3xl lg:text-left">{stats.totalItems}</p>
            <p className="text-xs text-muted-foreground">Jumlah unit sesuai pencarian dan filter aktif.</p>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 lg:flex lg:flex-col lg:items-start lg:gap-2">
            <p className="text-sm font-medium text-muted-foreground">Stock Tersedia</p>
            <p className="text-right text-2xl font-bold tracking-tight sm:text-3xl lg:text-left">{stats.availableItems}</p>
            <p className="text-xs text-muted-foreground">Unit yang dapat dipilih pada Barang Keluar.</p>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 lg:flex lg:flex-col lg:items-start lg:gap-2">
            <p className="text-sm font-medium text-muted-foreground">Type Ditampilkan</p>
            <p className="text-right text-2xl font-bold tracking-tight sm:text-3xl lg:text-left">{stats.uniqueTypes}</p>
            <p className="text-xs text-muted-foreground">Jumlah type unik pada hasil aktif.</p>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 lg:flex lg:flex-col lg:items-start lg:gap-2">
            <p className="text-sm font-medium text-muted-foreground">Total Nilai Stock</p>
            <p className="text-right text-lg font-bold leading-snug tracking-tight sm:text-2xl lg:text-left">{formatRupiah(stats.totalAsset)}</p>
            <p className="text-xs text-muted-foreground">Akumulasi modal unit pada hasil aktif.</p>
          </div>
        </Card>
      </section>

      <div className="min-w-0 overflow-x-clip rounded-xl border border-border bg-card p-4">
        <div className="mb-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="searchStock">Cari Data Stock</Label>
            <Input
              id="searchStock"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari type, IMEI, status, atau harga"
            />
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="stockPeriodFilter">Periode Dibuat</Label>
            <Select
              triggerId="stockPeriodFilter"
              value={periodFilter}
              onValueChange={(value) => {
                setPeriodFilter(value as PeriodFilter);
                setCurrentPage(1);
              }}
              options={[
                { value: "all", label: "Semua" },
                { value: "today", label: "Hari Ini" },
                { value: "week", label: "Minggu Ini" },
                { value: "month", label: "Bulan Ini" },
              ]}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => void fetchRows()} disabled={loading}>
            <RefreshCcw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="scrollbar-AR overflow-x-auto">
          <Table className="min-w-full md:min-w-150">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">No</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>IMEI</TableHead>
                <TableHead>Harga Modal</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Memuat data stock...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className={error ? "text-center text-destructive" : "text-center text-muted-foreground"}>
                    {error ? "Data stock gagal dimuat. Gunakan tombol Coba Lagi." : "Belum ada inventory aktif."}
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Data stock tidak ditemukan.</TableCell></TableRow>
              ) : (
                paginatedRows.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-center">{startIndex + index + 1}</TableCell>
                    <TableCell className="max-w-36 truncate whitespace-nowrap">{row.type}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono">{row.imei}</TableCell>
                    <TableCell className="max-w-36 truncate whitespace-nowrap">{formatRupiah(Number(row.harga))}</TableCell>
                    <TableCell className="max-w-28 truncate whitespace-nowrap">
                      <Badge variant={row.status === "available" ? "success" : "destructive"}>{row.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full items-center gap-2 text-sm text-muted-foreground sm:w-auto">
            <span className="hidden sm:inline">Rows:</span>
            <Select
              value={String(rowsPerPage)}
              onValueChange={(value) => {
                setRowsPerPage(Number(value));
                setCurrentPage(1);
              }}
              options={[
                { value: "15", label: "15" },
                { value: "30", label: "30" },
                { value: "50", label: "50" },
              ]}
              className="w-18"
            />
            <span className="ml-auto text-xs sm:ml-0 sm:text-sm">Menampilkan {pageRangeStart}-{pageRangeEnd} dari {totalFilteredRows}</span>
          </div>

          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
            <Button type="button" variant="outline" size="sm" disabled={safeCurrentPage <= 1} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} aria-label="Halaman sebelumnya">
              <ChevronLeft className="size-4" /><span className="hidden lg:inline">Sebelumnya</span>
            </Button>
            <span className="text-xs text-muted-foreground sm:text-sm">Halaman {safeCurrentPage} / {totalPages}</span>
            <Button type="button" variant="outline" size="sm" disabled={safeCurrentPage >= totalPages} onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))} aria-label="Halaman berikutnya">
              <span className="hidden lg:inline">Berikutnya</span><ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
