"use client";

import { Activity, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Info, RefreshCcw } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal } from "@/lib/format";
import type { ActivityLog } from "@/types";

type PeriodFilter = "all" | "today" | "week" | "month";
type ModuleFilter = "all" | "stock" | "stock_in" | "stock_out";
type ActionFilter = "all" | "create" | "update" | "delete" | "checkout";

function moduleLabel(module: string) {
  if (module === "stock") return "Stock";
  if (module === "stock_in") return "Barang Masuk";
  if (module === "stock_out") return "Barang Keluar";
  return module;
}

function actionLabel(action: string) {
  if (action === "create") return "Create";
  if (action === "update") return "Update";
  if (action === "delete") return "Delete";
  if (action === "checkout") return "Checkout";
  return action;
}

function actionBadgeVariant(action: string): "success" | "warning" | "destructive" | "secondary" {
  if (action === "create" || action === "checkout") return "success";
  if (action === "update") return "warning";
  if (action === "delete") return "destructive";
  return "secondary";
}

function formatFieldLabel(key: string) {
  const keyMap: Record<string, string> = {
    type: "Tipe Barang",
    imei: "IMEI",
    pembeli: "Pembeli",
    penjual: "Penjual",
    status: "Status",
    harga: "Harga",
    harga_modal: "Harga Modal",
    harga_jual: "Harga Jual",
    keuntungan: "Keuntungan",
    tanggal_masuk: "Tanggal Masuk",
    tanggal_keluar: "Tanggal Keluar",
    created_at: "Waktu Dibuat",
    updated_at: "Waktu Diubah",
    actor_name: "Pengguna",
    entity_label: "Entity",
  };

  if (keyMap[key]) {
    return keyMap[key];
  }

  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDetailValue(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return "-";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("id-ID").format(value);
  }

  if (typeof value === "boolean") {
    return value ? "Ya" : "Tidak";
  }

  if (typeof value === "string") {
    const isDateLike = /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value);

    if (isDateLike) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleString("id-ID", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: value.includes("T") ? "2-digit" : undefined,
          minute: value.includes("T") ? "2-digit" : undefined,
        });
      }
    }

    return value;
  }

  return JSON.stringify(value);
}

type DetailChange = {
  key: string;
  label: string;
  beforeValue: unknown;
  afterValue: unknown;
  status: "Ditambah" | "Diubah" | "Dihapus";
};

function getDetailChanges(beforeData: Record<string, unknown> | null, afterData: Record<string, unknown> | null): DetailChange[] {
  const beforeRecord = beforeData ?? {};
  const afterRecord = afterData ?? {};
  const keys = Array.from(new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]));

  return keys
    .filter((key) => JSON.stringify(beforeRecord[key]) !== JSON.stringify(afterRecord[key]))
    .map((key) => {
      const beforeValue = beforeRecord[key];
      const afterValue = afterRecord[key];

      let status: DetailChange["status"] = "Diubah";

      if (typeof beforeValue === "undefined" || beforeValue === null) {
        status = "Ditambah";
      } else if (typeof afterValue === "undefined" || afterValue === null) {
        status = "Dihapus";
      }

      return {
        key,
        label: formatFieldLabel(key),
        beforeValue,
        afterValue,
        status,
      };
    });
}

export function ActivityDashboard() {
  const [rows, setRows] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [infoPopoverOpen, setInfoPopoverOpen] = useState(false);
  const infoPopoverRef = useRef<HTMLDivElement | null>(null);

  function toggleExpanded(id: string) {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  const loadRows = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setLoading(true);
    }

    setError(null);

    const response = await fetch("/api/activity", { cache: "no-store" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "Gagal memuat activity log." }))) as {
        message?: string;
      };
      setError(payload.message ?? "Gagal memuat activity log.");
      setLoading(false);
      return;
    }

    const data = (await response.json()) as ActivityLog[];
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadRows(true);
    }, 0);

    const intervalId = window.setInterval(() => {
      void loadRows(false);
    }, 30_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [loadRows]);

  useEffect(() => {
    if (!infoPopoverOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (infoPopoverRef.current && !infoPopoverRef.current.contains(target)) {
        setInfoPopoverOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInfoPopoverOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [infoPopoverOpen]);

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

      const matchesModule = moduleFilter === "all" ? true : row.module === moduleFilter;
      const matchesAction = actionFilter === "all" ? true : row.action === actionFilter;

      const matchesSearch =
        !keyword ||
        [row.actor_name, row.entity_label, row.description, row.module, row.action, row.entity_id]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLowerCase().includes(keyword));

      return matchesPeriod && matchesModule && matchesAction && matchesSearch;
    });
  }, [rows, search, periodFilter, moduleFilter, actionFilter]);

  const totalFilteredRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredRows / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + rowsPerPage);
  const pageRangeStart = totalFilteredRows === 0 ? 0 : startIndex + 1;
  const pageRangeEnd = Math.min(startIndex + rowsPerPage, totalFilteredRows);

  return (
    <div className="grid min-w-0 gap-5 overflow-x-clip">
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" /> Riwayat Aktivitas Sistem
            </CardTitle>
            <div ref={infoPopoverRef} className="relative shrink-0">
              <Badge
                variant="outline"
                className="hidden gap-1.5 border-blue-200 bg-blue-50 text-blue-700 lg:inline-flex dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
              >
                <span>Riwayat 2 bulan terakhir akan terhapus</span>
                <Info className="size-4" />
              </Badge>

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="border-blue-200 bg-blue-50 text-blue-700 lg:hidden dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                aria-label="Info retensi data aktivitas"
                aria-expanded={infoPopoverOpen}
                onClick={() => setInfoPopoverOpen((prev) => !prev)}
              >
                <Info className="size-4" />
              </Button>

              {infoPopoverOpen ? (
                <div className="absolute top-full right-0 z-20 mt-2 w-64 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-md lg:hidden">
                  <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                    Riwayat 2 bulan terakhir akan terhapus
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <CardDescription>Dashboard activity bersifat read-only. Data history tidak bisa diedit atau dihapus.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="grid min-w-0 gap-2 sm:col-span-2 xl:col-span-2">
            <Label htmlFor="activitySearch">Cari Aktivitas</Label>
            <Input
              id="activitySearch"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari user, deskripsi, modul, aksi, atau entity"
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="activityPeriod">Periode</Label>
            <Select
              triggerId="activityPeriod"
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

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="activityModule">Modul</Label>
            <Select
              triggerId="activityModule"
              value={moduleFilter}
              onValueChange={(value) => {
                setModuleFilter(value as ModuleFilter);
                setCurrentPage(1);
              }}
              options={[
                { value: "all", label: "Semua Modul" },
                { value: "stock", label: "Stock" },
                { value: "stock_in", label: "Barang Masuk" },
                { value: "stock_out", label: "Barang Keluar" },
              ]}
            />
          </div>

          <div className="grid min-w-0 gap-2 sm:col-span-2 xl:col-span-1">
            <Label htmlFor="activityAction">Aksi</Label>
            <div className="flex min-w-0 gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  triggerId="activityAction"
                  value={actionFilter}
                  onValueChange={(value) => {
                    setActionFilter(value as ActionFilter);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: "all", label: "Semua Aksi" },
                    { value: "create", label: "Create" },
                    { value: "update", label: "Update" },
                    { value: "delete", label: "Delete" },
                    { value: "checkout", label: "Checkout" },
                  ]}
                />
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => void loadRows(true)} aria-label="Refresh activity">
                <RefreshCcw className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Daftar Aktivitas</CardTitle>
          <CardDescription>{filteredRows.length} aktivitas ditemukan.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 px-0 sm:px-6">
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          <div className="scrollbar-AR overflow-x-auto px-3 sm:px-0">
            <Table className="min-w-full md:min-w-190">
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Modul</TableHead>
                <TableHead>Aksi</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Deskripsi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Memuat activity log...
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Belum ada data aktivitas.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row) => {
                  const open = Boolean(expandedRows[row.id]);
                  const changes = getDetailChanges(row.before_data, row.after_data);
                  const addedCount = changes.filter((item) => item.status === "Ditambah").length;
                  const updatedCount = changes.filter((item) => item.status === "Diubah").length;
                  const deletedCount = changes.filter((item) => item.status === "Dihapus").length;

                  return (
                    <Fragment key={row.id}>
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">{formatTanggal(row.created_at)}</TableCell>
                        <TableCell className="max-w-36 truncate whitespace-nowrap">{row.actor_name ?? "Unknown User"}</TableCell>
                        <TableCell className="max-w-28 truncate whitespace-nowrap">{moduleLabel(row.module)}</TableCell>
                        <TableCell className="max-w-28 truncate whitespace-nowrap">
                          <Badge variant={actionBadgeVariant(row.action)}>{actionLabel(row.action)}</Badge>
                        </TableCell>
                        <TableCell className="max-w-40 truncate whitespace-nowrap">{row.entity_label ?? row.entity_id ?? "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate whitespace-nowrap">{row.description ?? "-"}</span>
                            <Button type="button" variant="ghost" size="sm" onClick={() => toggleExpanded(row.id)} aria-label={open ? "Tutup detail" : "Lihat detail"}>
                              {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                              <span className="hidden lg:inline">{open ? "Tutup" : "Detail"}</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {open ? (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/25">
                            <div className="grid gap-3">
                              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm">
                                <span className="font-semibold">Ringkasan Perubahan:</span>
                                <Badge variant="success">Ditambah {addedCount}</Badge>
                                <Badge variant="warning">Diubah {updatedCount}</Badge>
                                <Badge variant="destructive">Dihapus {deletedCount}</Badge>
                              </div>

                              {changes.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                                  Tidak ada detail perubahan field yang tercatat pada aktivitas ini.
                                </div>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-border bg-background">
                                  <table className="w-full min-w-190 border-collapse text-sm">
                                    <thead className="bg-muted/50">
                                      <tr>
                                        <th className="border-b border-border px-3 py-2 text-left font-semibold">Field</th>
                                        <th className="border-b border-border px-3 py-2 text-left font-semibold">Sebelum</th>
                                        <th className="border-b border-border px-3 py-2 text-left font-semibold">Sesudah</th>
                                        <th className="border-b border-border px-3 py-2 text-left font-semibold">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {changes.map((item) => (
                                        <tr key={`${row.id}-${item.key}`}>
                                          <td className="border-b border-border px-3 py-2">{item.label}</td>
                                          <td className="border-b border-border px-3 py-2">{formatDetailValue(item.beforeValue)}</td>
                                          <td className="border-b border-border px-3 py-2">{formatDetailValue(item.afterValue)}</td>
                                          <td className="border-b border-border px-3 py-2">
                                            <Badge
                                              variant={
                                                item.status === "Ditambah"
                                                  ? "success"
                                                  : item.status === "Diubah"
                                                    ? "warning"
                                                    : "destructive"
                                              }
                                            >
                                              {item.status}
                                            </Badge>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })
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
              <span className="ml-auto text-xs sm:ml-0 sm:text-sm">
                Menampilkan {pageRangeStart}-{pageRangeEnd} dari {totalFilteredRows}
              </span>
            </div>

            <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="size-4" />
                <span className="hidden lg:inline">Sebelumnya</span>
              </Button>
              <span className="text-xs text-muted-foreground sm:text-sm">
                Halaman {safeCurrentPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                aria-label="Halaman berikutnya"
              >
                <span className="hidden lg:inline">Berikutnya</span>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
