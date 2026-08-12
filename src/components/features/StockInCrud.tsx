"use client";

import { ChevronLeft, ChevronRight, Funnel, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah, formatTanggal } from "@/lib/format";
import type { Stock, StockIn } from "@/types";

type FormState = {
  type: string;
  imei: string;
  harga: string;
  penjual: string;
  tanggal_masuk: string;
};

const initialForm: FormState = {
  type: "",
  imei: "",
  harga: "",
  penjual: "",
  tanggal_masuk: "",
};

function parseCurrencyToNumberString(value: string) {
  return value.replace(/\D/g, "");
}

function formatRupiahInput(value: string) {
  if (!value) {
    return "";
  }

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function StockInCrud() {
  const [rows, setRows] = useState<StockIn[]>([]);
  const [stockRows, setStockRows] = useState<Stock[]>([]);
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState<"all" | "today" | "week" | "month">("month");
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const periodMenuRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [editCandidate, setEditCandidate] = useState<StockIn | null>(null);

  async function fetchRows() {
    const response = await fetch("/api/stock-in", { cache: "no-store" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "Gagal memuat barang masuk." }))) as {
        message?: string;
      };
      toast.error(payload.message ?? "Gagal memuat barang masuk.");
      setLoading(false);
      return;
    }

    const data = (await response.json()) as StockIn[];
    setRows(data);
    setLoading(false);
  }

  async function fetchStockRows() {
    const response = await fetch("/api/stock", { cache: "no-store" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "Gagal memuat data stock." }))) as {
        message?: string;
      };
      toast.error(payload.message ?? "Gagal memuat data stock.");
      return;
    }

    const data = (await response.json()) as Stock[];
    setStockRows(data);
  }

  useEffect(() => {
    async function loadInitialRows() {
      await Promise.all([fetchRows(), fetchStockRows()]);
    }

    void loadInitialRows();
  }, []);

  useEffect(() => {
    if (!periodMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (periodMenuRef.current && !periodMenuRef.current.contains(target)) {
        setPeriodMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPeriodMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [periodMenuOpen]);

  const submitLabel = useMemo(() => (editingId ? "Update Barang Masuk" : "Tambah Barang Masuk"), [editingId]);

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
      const masukDate = new Date(row.tanggal_masuk);
      const validDate = !Number.isNaN(masukDate.getTime());

      const matchesPeriod =
        periodFilter === "all"
          ? true
          : validDate &&
            (periodFilter === "today"
              ? masukDate >= startOfToday && masukDate < startOfTomorrow
              : periodFilter === "week"
                ? masukDate >= startOfWeek && masukDate < startOfTomorrow
                : masukDate >= startOfMonth && masukDate < startOfNextMonth);

      const matchesKeyword =
        !keyword || [row.type, row.imei, row.penjual, row.tanggal_masuk, String(row.harga)].some((value) => value.toLowerCase().includes(keyword));

      return matchesPeriod && matchesKeyword;
    });
  }, [rows, search, periodFilter]);

  const totalFilteredRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredRows / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + rowsPerPage);
  const pageRangeStart = totalFilteredRows === 0 ? 0 : startIndex + 1;
  const pageRangeEnd = Math.min(startIndex + rowsPerPage, totalFilteredRows);

  const stats = useMemo(() => {
    const totalItems = filteredRows.length;
    const totalAccumulatedStockIn = filteredRows.reduce((sum, row) => sum + Number(row.harga), 0);
    const totalModal = stockRows.reduce((sum, row) => sum + Number(row.harga), 0);
    const uniqueSuppliers = new Set(filteredRows.map((row) => row.penjual.trim().toLowerCase()).filter(Boolean)).size;
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const monthItems = rows.filter((row) => row.tanggal_masuk.slice(0, 7) === currentMonthKey).length;

    return {
      totalItems,
      totalAccumulatedStockIn,
      totalModal,
      uniqueSuppliers,
      monthItems,
    };
  }, [filteredRows, stockRows, rows]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);

    if (!form.tanggal_masuk) {
      toast.error("Tanggal masuk wajib dipilih.");
      setSubmitting(false);
      return;
    }

    const endpoint = editingId ? `/api/stock-in/${editingId}` : "/api/stock-in";
    const method = editingId ? "PUT" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({ message: "Gagal menyimpan barang masuk." }))) as {
          message?: string;
        };
        toast.error(err.message ?? "Gagal menyimpan barang masuk.");
        return;
      }

      setForm(initialForm);
      setEditingId(null);
      setDialogOpen(false);
      toast.success("Data barang masuk berhasil disimpan.");
      await Promise.all([fetchRows(), fetchStockRows()]);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (deleteLoadingId === id) {
      return;
    }

    setDeleteLoadingId(id);

    try {
      const response = await fetch(`/api/stock-in/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({ message: "Gagal menghapus barang masuk." }))) as {
          message?: string;
        };
        toast.error(err.message ?? "Gagal menghapus barang masuk.");
        return;
      }

      toast.success("Data barang masuk berhasil dihapus.");
      await Promise.all([fetchRows(), fetchStockRows()]);
    } finally {
      setDeleteLoadingId(null);
    }
  }

  function handleEdit(row: StockIn) {
    toast.info("Anda sedang mengubah data barang masuk.");
    setEditingId(row.id);
    setForm({
      type: row.type,
      imei: row.imei,
      harga: String(row.harga),
      penjual: row.penjual,
      tanggal_masuk: row.tanggal_masuk,
    });
    setDialogOpen(true);
  }

  function handleOpenAddModal() {
    setEditingId(null);
    setForm(initialForm);
    setDialogOpen(true);
  }

  return (
    <div className="grid min-w-0 gap-5 overflow-x-clip">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 *:min-w-0">
        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 lg:flex lg:flex-col lg:items-start lg:gap-2">
            <p className="text-sm font-medium text-muted-foreground">Total Transaksi Masuk</p>
            <p className="text-right text-2xl font-bold tracking-tight sm:text-3xl lg:text-left">{stats.totalItems}</p>
            <p className="text-xs text-muted-foreground">Jumlah seluruh data sesuai filter aktif.</p>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 lg:flex lg:flex-col lg:items-start lg:gap-2">
            <div className="col-start-1 row-start-1 flex items-center justify-between gap-2 lg:w-full">
              <p className="text-sm font-medium text-muted-foreground">Total Akumulasi Barang Masuk</p>
              <Badge variant="secondary">Barang Masuk</Badge>
            </div>
            <p className="text-right text-lg font-bold leading-snug tracking-tight sm:text-2xl lg:text-left">{formatRupiah(stats.totalAccumulatedStockIn)}</p>
            <p className="text-xs text-muted-foreground">Akumulasi nilai transaksi sesuai filter aktif.</p>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 lg:flex lg:flex-col lg:items-start lg:gap-2">
            <div className="col-start-1 row-start-1 flex items-center justify-between gap-2 lg:w-full">
              <p className="text-sm font-medium text-muted-foreground">Total Nilai Modal</p>
              <Badge variant="secondary">Stock</Badge>
            </div>
            <p className="text-right text-lg font-bold leading-snug tracking-tight sm:text-2xl lg:text-left">{formatRupiah(stats.totalModal)}</p>
            <p className="text-xs text-muted-foreground">Akumulasi modal berdasarkan item yang masih ada di stock.</p>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 lg:flex lg:flex-col lg:items-start lg:gap-2">
            <p className="text-sm font-medium text-muted-foreground">Supplier Aktif</p>
            <p className="text-right text-2xl font-bold tracking-tight sm:text-3xl lg:text-left">{stats.uniqueSuppliers}</p>
            <p className="text-xs text-muted-foreground">Jumlah penjual unik sesuai filter aktif.</p>
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 lg:flex lg:flex-col lg:items-start lg:gap-2">
            <p className="text-sm font-medium text-muted-foreground">Transaksi Bulan Ini</p>
            <p className="text-right text-2xl font-bold tracking-tight sm:text-3xl lg:text-left">{stats.monthItems}</p>
            <p className="text-xs text-muted-foreground">Jumlah barang masuk pada bulan berjalan.</p>
          </div>
        </Card>
      </section>

      <div className="min-w-0 overflow-x-clip rounded-xl border border-border bg-card p-4">
        <div className="mb-4 grid min-w-0 gap-2">
            <Label htmlFor="searchStockIn">Cari Barang Masuk</Label>
            <div className="flex min-w-0 items-center gap-2">
              <Input
                id="searchStockIn"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari type, IMEI, harga, penjual, atau tanggal"
                className="min-w-0 flex-1"
              />

              <div ref={periodMenuRef} className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Filter periode"
                  onClick={() => setPeriodMenuOpen((prev) => !prev)}
                  className={periodFilter !== "all" ? "border-primary/40 bg-primary/10 text-primary" : ""}
                >
                  <Funnel className="size-4" />
                </Button>

                {periodMenuOpen ? (
                  <div className="absolute top-full right-0 z-20 mt-1 w-40 rounded-lg border border-border bg-popover p-1 shadow-md">
                    {[
                      { value: "all", label: "Semua" },
                      { value: "today", label: "Hari Ini" },
                      { value: "week", label: "Minggu Ini" },
                      { value: "month", label: "Bulan Ini" },
                    ].map((option) => {
                      const active = periodFilter === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setPeriodFilter(option.value as "all" | "today" | "week" | "month");
                            setCurrentPage(1);
                            setPeriodMenuOpen(false);
                          }}
                          className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${
                            active ? "bg-primary/15 text-primary" : "hover:bg-muted"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <Button
                type="button"
                onClick={handleOpenAddModal}
                aria-label="Tambah Barang Masuk"
                className="h-9 w-9 p-0 lg:w-auto lg:px-3"
              >
                <Plus className="size-5" />
                <span className="sr-only lg:not-sr-only lg:ml-2">Tambah Barang Masuk</span>
              </Button>
            </div>
        </div>

        <div className="scrollbar-AR overflow-x-auto">
          <Table className="min-w-full md:min-w-190">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">No</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>IMEI</TableHead>
              <TableHead>Harga Modal</TableHead>
              <TableHead>Penjual</TableHead>
              <TableHead>Tanggal Masuk</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-center">
                  Memuat data barang masuk...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-center">
                  Belum ada data barang masuk.
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-center">
                  Data barang masuk tidak ditemukan.
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="text-center">{startIndex + index + 1}</TableCell>
                  <TableCell className="max-w-36 truncate whitespace-nowrap">{row.type}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono">{row.imei}</TableCell>
                  <TableCell className="max-w-36 truncate whitespace-nowrap">{formatRupiah(Number(row.harga))}</TableCell>
                  <TableCell className="max-w-36 truncate whitespace-nowrap">{row.penjual}</TableCell>
                  <TableCell className="max-w-36 truncate whitespace-nowrap">{formatTanggal(row.tanggal_masuk)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditCandidate(row)}
                        aria-label="Edit barang masuk"
                        disabled={submitting || deleteLoadingId === row.id}
                      >
                        <Pencil className="size-4" />
                        <span className="hidden lg:inline">Edit</span>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteCandidateId(row.id)}
                        aria-label="Hapus barang masuk"
                        disabled={submitting || deleteLoadingId === row.id}
                      >
                        <Trash2 className="size-4" />
                        <span className="hidden lg:inline">Hapus</span>
                      </Button>
                    </div>
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
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Barang Masuk" : "Tambah Barang Masuk"}</DialogTitle>
              <DialogDescription>Isi detail barang masuk untuk memperbarui data inventory.</DialogDescription>
            </DialogHeader>

            <DialogBody className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
                <Input
                  id="type"
                  value={form.type}
                  onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
                  placeholder="Contoh: iPhone 13"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="imei">IMEI</Label>
                <Input
                  id="imei"
                  value={form.imei}
                  onChange={(e) => setForm((s) => ({ ...s, imei: e.target.value }))}
                  placeholder="Masukkan nomor IMEI"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="harga">Harga Modal</Label>
                <Input
                  id="harga"
                  type="text"
                  inputMode="numeric"
                  value={formatRupiahInput(form.harga)}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      harga: parseCurrencyToNumberString(e.target.value),
                    }))
                  }
                  placeholder="Rp 0"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="penjual">Penjual</Label>
                <Input
                  id="penjual"
                  value={form.penjual}
                  onChange={(e) => setForm((s) => ({ ...s, penjual: e.target.value }))}
                  placeholder="Contoh: Supplier Jaya"
                  required
                />
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="tanggalMasuk">Tanggal Masuk</Label>
                <DatePicker
                  id="tanggalMasuk"
                  value={form.tanggal_masuk}
                  onChange={(nextValue) => setForm((s) => ({ ...s, tanggal_masuk: nextValue }))}
                  placeholder="Pilih tanggal masuk"
                  disabledDate={(date) => date > new Date()}
                />
              </div>
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setEditingId(null);
                  setForm(initialForm);
                }}
              >
                Batal
              </Button>
              <Button type="submit" disabled={submitting}>
                <Plus className="size-4" />
                {submitting ? "Menyimpan..." : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteCandidateId)}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidateId(null);
        }}
        title="Hapus Barang Masuk"
        description="Data akan dihapus permanen. Lanjutkan?"
        confirmText="Ya, Hapus"
        destructive
        onConfirm={async () => {
          if (!deleteCandidateId) return;
          if (deleteLoadingId === deleteCandidateId) return;
          await handleDelete(deleteCandidateId);
          setDeleteCandidateId(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(editCandidate)}
        onOpenChange={(open) => {
          if (!open) setEditCandidate(null);
        }}
        title="Edit Barang Masuk"
        description="Masuk ke mode edit untuk data ini?"
        confirmText="Lanjut Edit"
        onConfirm={() => {
          if (!editCandidate) return;
          handleEdit(editCandidate);
          setEditCandidate(null);
        }}
      />
    </div>
  );
}
