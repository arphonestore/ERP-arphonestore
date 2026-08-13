"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Funnel, Pencil, Plus, RefreshCcw, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import type { Stock, StockOut } from "@/types";

type FormState = {
  type: string;
  imei: string;
  pembeli: string;
  harga_modal: string;
  harga_jual: string;
  tanggal_keluar: string;
};

type CheckoutDraftItem = {
  id: string;
  type: string;
  imei: string;
  pembeli: string;
  harga_modal: number;
  harga_jual: number;
  tanggal_keluar: string;
  idempotencyKey: string;
};

const DRAFT_STORAGE_KEY = "ar-store:stock-out-drafts:v1";
const NETWORK_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function toLocalDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatLocalDateOnly(value: string) {
  const date = parseLocalDateOnly(value);
  return date ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date) : value;
}

function createInitialForm(): FormState {
  return {
    type: "",
    imei: "",
    pembeli: "",
    harga_modal: "",
    harga_jual: "",
    tanggal_keluar: toLocalDateInput(),
  };
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

export function StockOutCrud() {
  const [rows, setRows] = useState<StockOut[]>([]);
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);
  const [search, setSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState<"all" | "today" | "week" | "month">("month");
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const periodMenuRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState<FormState>(() => createInitialForm());
  const [draftItems, setDraftItems] = useState<CheckoutDraftItem[]>([]);
  const [draftsHydrated, setDraftsHydrated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [editCandidate, setEditCandidate] = useState<StockOut | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [stocksError, setStocksError] = useState<string | null>(null);

  async function fetchRows(showLoading = true): Promise<StockOut[] | null> {
    if (showLoading) setLoading(true);
    setRowsError(null);

    try {
      const response = await fetchWithTimeout("/api/stock-out", { cache: "no-store" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ message: "Gagal memuat barang keluar." }))) as {
          message?: string;
        };
        throw new Error(payload.message ?? "Gagal memuat barang keluar.");
      }

      const data = (await response.json()) as StockOut[];
      setRows(data);
      return data;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Gagal memuat barang keluar. Periksa koneksi lalu coba lagi.";
      setRowsError(message);
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function fetchAvailableStocks(): Promise<Stock[] | null> {
    setStocksError(null);

    try {
      const response = await fetchWithTimeout("/api/stock", { cache: "no-store" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ message: "Gagal memuat stock tersedia." }))) as {
          message?: string;
        };
        throw new Error(payload.message ?? "Gagal memuat stock tersedia.");
      }

      const data = (await response.json()) as Stock[];
      const available = data.filter((item) => item.status === "available");
      setAvailableStocks(available);
      return available;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Gagal memuat stock tersedia. Periksa koneksi lalu coba lagi.";
      setStocksError(message);
      return null;
    }
  }

  useEffect(() => {
    void Promise.all([fetchRows(), fetchAvailableStocks()]);
  }, []);

  useEffect(() => {
    try {
      const storedDrafts = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (!storedDrafts) return;

      const parsed = JSON.parse(storedDrafts) as unknown;
      if (!Array.isArray(parsed)) return;

      const validDrafts = parsed.filter((item): item is CheckoutDraftItem => {
        if (!item || typeof item !== "object") return false;
        const draft = item as Partial<CheckoutDraftItem>;
        return (
          typeof draft.id === "string" &&
          typeof draft.idempotencyKey === "string" &&
          typeof draft.type === "string" &&
          typeof draft.imei === "string" &&
          typeof draft.pembeli === "string" &&
          typeof draft.harga_modal === "number" &&
          typeof draft.harga_jual === "number" &&
          typeof draft.tanggal_keluar === "string"
        );
      });

      setDraftItems(validDrafts);
    } catch {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      toast.warning("Draft checkout lama tidak valid dan telah direset.");
    } finally {
      setDraftsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!draftsHydrated) return;

    try {
      if (draftItems.length === 0) {
        window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftItems));
      }
    } catch {
      toast.error("Draft checkout tidak dapat disimpan di sesi browser ini.");
    }
  }, [draftItems, draftsHydrated]);

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

  const filteredAvailableStocks = useMemo(() => {
    const keyword = stockSearch.trim().toLowerCase();

    if (!keyword) {
      return availableStocks;
    }

    return availableStocks.filter((item) => {
      return [item.type, item.imei, String(item.harga)].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [availableStocks, stockSearch]);

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
      const keluarDate = parseLocalDateOnly(row.tanggal_keluar);
      const validDate = keluarDate !== null;

      const matchesPeriod =
        periodFilter === "all"
          ? true
          : validDate &&
            (periodFilter === "today"
              ? keluarDate! >= startOfToday && keluarDate! < startOfTomorrow
              : periodFilter === "week"
                ? keluarDate! >= startOfWeek && keluarDate! < startOfTomorrow
                : keluarDate! >= startOfMonth && keluarDate! < startOfNextMonth);

      const matchesKeyword =
        !keyword ||
        [
          row.type,
          row.imei,
          row.pembeli,
          row.tanggal_keluar,
          String(row.harga_modal),
          String(row.harga_jual),
          String(row.keuntungan ?? 0),
        ].some((value) => value.toLowerCase().includes(keyword));

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

  const keuntunganPreview = useMemo(() => {
    const modal = Number(form.harga_modal);
    const jual = Number(form.harga_jual);

    if (Number.isNaN(modal) || Number.isNaN(jual)) {
      return 0;
    }

    return jual - modal;
  }, [form.harga_modal, form.harga_jual]);

  const checkoutPreview = useMemo(() => {
    const totalModal = draftItems.reduce((sum, item) => sum + item.harga_modal, 0);
    const totalJual = draftItems.reduce((sum, item) => sum + item.harga_jual, 0);

    return {
      totalModal,
      totalJual,
      totalProfit: totalJual - totalModal,
    };
  }, [draftItems]);

  function validateDraftForm() {
    const selectedStock = availableStocks.find((item) => item.imei === form.imei);

    if (!form.imei || (!editingId && !selectedStock)) {
      return "Pilih item yang masih tersedia dari daftar stock.";
    }

    if (!form.type.trim() || !/^\d{6,20}$/.test(form.imei.trim())) {
      return "Detail barang atau IMEI tidak valid.";
    }

    const buyer = form.pembeli.trim();
    if (buyer.length < 2 || buyer.length > 100) {
      return "Nama pembeli wajib terdiri dari 2-100 karakter.";
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.tanggal_keluar) || !parseLocalDateOnly(form.tanggal_keluar)) {
      return "Tanggal keluar tidak valid.";
    }

    if (form.tanggal_keluar > toLocalDateInput()) {
      return "Tanggal keluar tidak boleh melewati hari ini.";
    }

    const hargaModal = Number(form.harga_modal);
    const hargaJual = Number(form.harga_jual);

    if (!Number.isSafeInteger(hargaModal) || hargaModal <= 0) {
      return "Harga modal stock tidak valid. Muat ulang daftar stock.";
    }

    if (!Number.isSafeInteger(hargaJual) || hargaJual <= 0) {
      return "Harga jual harus berupa angka bulat lebih dari 0.";
    }

    return null;
  }

  function handlePickStock(item: Stock) {
    if (editingId) {
      return;
    }

    if (draftItems.some((draft) => draft.imei === item.imei)) {
      toast.info("Item ini sudah ada di daftar draft checkout.");
      return;
    }

    if (form.imei && form.imei !== item.imei) {
      const pendingMessage = validateDraftForm();

      if (pendingMessage !== null) {
        toast.info("Lengkapi lalu simpan draft item saat ini, atau batalkan form dulu.");
        return;
      }
    }

    setForm((state) => ({
      ...state,
      type: item.type,
      imei: item.imei,
      harga_modal: String(item.harga),
      harga_jual: "",
      pembeli: "",
      tanggal_keluar: toLocalDateInput(),
    }));
  }

  function handleSaveDraft() {
    if (savingDraft) {
      return;
    }

    setSavingDraft(true);

    const errorMessage = validateDraftForm();

    if (errorMessage) {
      toast.error(errorMessage);
      setSavingDraft(false);
      return;
    }

    if (draftItems.some((item) => item.imei === form.imei)) {
      toast.info("Item ini sudah tersimpan sebagai draft.");
      setSavingDraft(false);
      return;
    }

    const draftItem: CheckoutDraftItem = {
      id: `${form.imei}-${Date.now()}`,
      type: form.type,
      imei: form.imei,
      pembeli: form.pembeli.trim(),
      harga_modal: Number(form.harga_modal),
      harga_jual: Number(form.harga_jual),
      tanggal_keluar: form.tanggal_keluar,
      idempotencyKey: createIdempotencyKey(),
    };

    setDraftItems((prev) => [...prev, draftItem]);
    setForm(createInitialForm());
    toast.success("Item checkout berhasil disimpan ke draft.");
    setSavingDraft(false);
  }

  function resetCheckoutForm() {
    if (editingId) {
      setEditingId(null);
    }
    setForm(createInitialForm());
  }

  function removeDraftItem(id: string) {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
  }

  function transactionMatchesDraft(row: StockOut, draft: CheckoutDraftItem) {
    return (
      row.imei === draft.imei &&
      row.pembeli.trim() === draft.pembeli.trim() &&
      Number(row.harga_jual) === draft.harga_jual &&
      row.tanggal_keluar.slice(0, 10) === draft.tanggal_keluar
    );
  }

  async function verifyDraftCommitted(draft: CheckoutDraftItem) {
    const latestRows = await fetchRows(false);
    return latestRows?.some((row) => transactionMatchesDraft(row, draft)) ?? false;
  }

  async function handleCheckoutDrafts() {
    if (submitting) return;

    if (draftItems.length === 0) {
      toast.info("Belum ada item draft untuk diproses checkout.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetchWithTimeout("/api/stock-out/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: draftItems.map((draft) => ({
            imei: draft.imei,
            pembeli: draft.pembeli,
            harga_jual: draft.harga_jual,
            tanggal_keluar: draft.tanggal_keluar,
            idempotency_key: draft.idempotencyKey,
          })),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({
          message: "Batch checkout gagal.",
        }))) as { message?: string };
        throw new Error(payload.message ?? "Batch checkout gagal.");
      }

      setDraftItems([]);
      setForm(createInitialForm());
      toast.success(`${draftItems.length} item berhasil di-checkout secara atomik.`);
    } catch (checkoutError) {
      const committedChecks = await Promise.all(
        draftItems.map(async (draft) => {
          try {
            return await verifyDraftCommitted(draft);
          } catch {
            return false;
          }
        })
      );

      if (committedChecks.every(Boolean)) {
        setDraftItems([]);
        setForm(createInitialForm());
        toast.success(`${draftItems.length} item terverifikasi sudah di-checkout.`);
      } else {
        toast.error(
          checkoutError instanceof Error
            ? `${checkoutError.message} Tidak ada item baru yang diproses sebagian; draft dipertahankan untuk retry.`
            : "Batch checkout gagal. Draft dipertahankan untuk retry."
        );
      }
    } finally {
      await Promise.all([fetchRows(false), fetchAvailableStocks()]);
      setSubmitting(false);
    }
  }

  async function handleUpdateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    if (!editingId) {
      return;
    }

    const validationError = validateDraftForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetchWithTimeout(`/api/stock-out/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pembeli: form.pembeli.trim(),
          harga_jual: Number(form.harga_jual),
          tanggal_keluar: form.tanggal_keluar,
        }),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({ message: "Gagal memperbarui transaksi." }))) as {
          message?: string;
        };
        throw new Error(err.message ?? "Gagal memperbarui transaksi.");
      }

      toast.success("Transaksi barang keluar berhasil diperbarui.");
      setEditingId(null);
      setForm(createInitialForm());
      await Promise.all([fetchRows(false), fetchAvailableStocks()]);
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Gagal memperbarui transaksi. Periksa koneksi lalu coba lagi.");
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
      const response = await fetchWithTimeout(`/api/stock-out/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({ message: "Gagal menghapus barang keluar." }))) as {
          message?: string;
        };
        throw new Error(err.message ?? "Gagal menghapus barang keluar.");
      }

      toast.success("Data barang keluar berhasil dihapus.");
      await Promise.all([fetchRows(false), fetchAvailableStocks()]);
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Gagal menghapus barang keluar. Periksa koneksi lalu coba lagi.");
    } finally {
      setDeleteLoadingId(null);
    }
  }

  function handleEdit(row: StockOut) {
    toast.info("Anda sedang mengubah data transaksi barang keluar.");
    setEditingId(row.id);
    setForm({
      type: row.type,
      imei: row.imei,
      pembeli: row.pembeli,
      harga_modal: String(row.harga_modal),
      harga_jual: String(row.harga_jual),
      tanggal_keluar: row.tanggal_keluar,
    });
  }

  return (
    <div className="grid min-w-0 gap-5 overflow-x-clip">
      {rowsError || stocksError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3" role="alert">
          <AlertTriangle className="size-4 text-destructive" />
          <div className="min-w-0 flex-1 text-sm text-destructive">
            {rowsError ? <p>Riwayat: {rowsError} Data terakhir tetap ditampilkan.</p> : null}
            {stocksError ? <p>Stock tersedia: {stocksError} Data terakhir tetap ditampilkan.</p> : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void Promise.all([fetchRows(), fetchAvailableStocks()])}
            disabled={loading || submitting}
          >
            <RefreshCcw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Coba Lagi
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr] *:min-w-0">
        <div className="min-w-0 rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Pilih Barang Stock</h2>
              <p className="text-muted-foreground text-sm">Pilih item, isi panel, lalu simpan sebagai draft checkout.</p>
            </div>
            <Input
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              placeholder="Cari type, IMEI, atau harga"
              className="w-full md:w-72"
            />
          </div>

          <div className="scrollbar-AR grid max-h-117.5 grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3">
            {filteredAvailableStocks.length === 0 ? (
              <div className="col-span-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {stocksError ? "Daftar stock gagal dimuat. Gunakan tombol Coba Lagi." : "Tidak ada stock tersedia."}
              </div>
            ) : (
              filteredAvailableStocks.map((item) => {
                const selected = form.imei === item.imei && !editingId;
                const drafted = draftItems.some((draft) => draft.imei === item.imei);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePickStock(item)}
                    disabled={Boolean(editingId)}
                    className={`rounded-xl border p-3 text-left transition ${
                      selected
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : drafted
                          ? "border-emerald-500/60 bg-emerald-500/10"
                          : "border-border hover:border-primary/60 hover:bg-muted/60"
                    } ${editingId ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  >
                    <p className="text-sm font-semibold">{item.type}</p>
                    <p className="text-muted-foreground mt-1 text-xs">IMEI: {item.imei}</p>
                    <p className="mt-3 text-sm font-medium">{formatRupiah(Number(item.harga))}</p>
                    {drafted ? <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Tersimpan di draft</p> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{editingId ? "Panel Edit Transaksi" : "Panel Draft Checkout"}</h2>
            {editingId ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Mode Edit</span> : null}
          </div>

          <form onSubmit={handleUpdateSubmit} className="grid gap-3">
            <div className="bg-muted/50 grid gap-2 rounded-lg border border-border p-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Detail Barang</p>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{form.type || "-"}</span>

                <span className="text-muted-foreground">IMEI</span>
                <span className="font-medium">{form.imei || "-"}</span>

                <span className="text-muted-foreground">Harga Modal</span>
                <span className="font-medium">{form.harga_modal ? formatRupiah(Number(form.harga_modal)) : "-"}</span>

                <span className="text-muted-foreground">Harga Jual</span>
                <span className="font-medium">{form.harga_jual ? formatRupiah(Number(form.harga_jual)) : "-"}</span>

                <span className="text-muted-foreground">Keuntungan</span>
                <span className={`font-semibold ${keuntunganPreview >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"}`}>
                  {form.harga_modal && form.harga_jual ? formatRupiah(keuntunganPreview) : "-"}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pembeli">Nama Pembeli</Label>
              <Input
                id="pembeli"
                value={form.pembeli}
                onChange={(e) => setForm((s) => ({ ...s, pembeli: e.target.value }))}
                placeholder="Contoh: Budi"
                minLength={2}
                maxLength={100}
                autoComplete="name"
                required={Boolean(editingId) || Boolean(form.imei)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tanggalKeluar">Tanggal Keluar</Label>
              <DatePicker
                id="tanggalKeluar"
                value={form.tanggal_keluar}
                onChange={(nextValue) => setForm((s) => ({ ...s, tanggal_keluar: nextValue }))}
                disabledDate={(date) => date > new Date()}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="hargaJual">Harga Jual</Label>
              <Input
                id="hargaJual"
                type="text"
                inputMode="numeric"
                maxLength={18}
                value={formatRupiahInput(form.harga_jual)}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    harga_jual: parseCurrencyToNumberString(e.target.value),
                  }))
                }
                placeholder="Rp 0"
                required={Boolean(editingId) || Boolean(form.imei)}
              />
            </div>

            {editingId ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" disabled={submitting} className="min-w-40">
                  <Plus className="size-4" />
                  {submitting ? "Menyimpan..." : "Update Transaksi"}
                </Button>
                <Button type="button" variant="outline" onClick={resetCheckoutForm}>
                  Batal Edit
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" onClick={handleSaveDraft} disabled={!form.imei || savingDraft || submitting} className="min-w-40">
                  <Plus className="size-4" />
                  {savingDraft ? "Menyimpan Draft..." : "Simpan ke Draft"}
                </Button>

                <Button type="button" variant="outline" onClick={resetCheckoutForm}>
                  Batalkan Item
                </Button>
              </div>
            )}

            {!editingId && !form.imei ? (
              <p className="text-xs text-muted-foreground">Pilih item stock di panel, isi form, lalu simpan ke draft checkout.</p>
            ) : null}
          </form>
        </div>
      </section>

      {!editingId ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Detail Item Checkout</h2>
              <p className="text-sm text-muted-foreground">Seluruh item diproses dalam satu transaksi atomik: semuanya berhasil atau seluruh batch dibatalkan.</p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{draftItems.length} item</span>
          </div>

          {draftItems.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              Belum ada item draft checkout.
            </div>
          ) : (
            <div className="grid gap-3">
              {draftItems.map((item) => {
                const keuntungan = item.harga_jual - item.harga_modal;

                return (
                  <div key={item.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{item.type}</p>
                        <p className="text-muted-foreground text-xs">IMEI: {item.imei}</p>
                      </div>

                      <Button type="button" variant="ghost" size="sm" onClick={() => removeDraftItem(item.id)}>
                        <Trash2 className="size-4" />
                        Hapus
                      </Button>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <p>
                        Pembeli: <span className="font-medium">{item.pembeli}</span>
                      </p>
                      <p>
                        Modal: <span className="font-medium">{formatRupiah(item.harga_modal)}</span>
                      </p>
                      <p>
                        Jual: <span className="font-medium">{formatRupiah(item.harga_jual)}</span>
                      </p>
                      <p>
                        Keuntungan: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatRupiah(keuntungan)}</span>
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Tanggal Keluar: {formatLocalDateOnly(item.tanggal_keluar)}</p>
                  </div>
                );
              })}

              <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p>Total Modal: <span className="font-semibold">{formatRupiah(checkoutPreview.totalModal)}</span></p>
                <p>Total Jual: <span className="font-semibold">{formatRupiah(checkoutPreview.totalJual)}</span></p>
                <p>
                  Estimasi Keuntungan: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatRupiah(checkoutPreview.totalProfit)}</span>
                </p>
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={handleCheckoutDrafts} disabled={submitting || draftItems.length === 0} className="min-w-52">
                  <ShoppingCart className="size-4" />
                  {submitting ? "Memproses Batch..." : "Proses Batch Checkout"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="min-w-0 rounded-xl border border-border bg-card p-4">
        <div className="mb-4 grid gap-2">
          <Label htmlFor="searchStockOut">Riwayat Barang Keluar</Label>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              id="searchStockOut"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari type, IMEI, pembeli, atau harga"
              className="min-w-0 flex-1 md:max-w-sm"
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
          </div>
        </div>

        {rowsError && rows.length > 0 ? (
          <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">Menampilkan riwayat terakhir yang berhasil dimuat.</p>
        ) : null}
        <div className="scrollbar-AR overflow-x-auto">
          <Table className="min-w-full md:min-w-220">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">No</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>IMEI</TableHead>
              <TableHead>Pembeli</TableHead>
              <TableHead>Harga Modal</TableHead>
              <TableHead>Harga Jual</TableHead>
              <TableHead>Keuntungan</TableHead>
              <TableHead>Tanggal Keluar</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground text-center">
                  Memuat data barang keluar...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className={rowsError ? "text-center text-destructive" : "text-center text-muted-foreground"}>
                  {rowsError ? "Riwayat gagal dimuat. Gunakan tombol Coba Lagi." : "Belum ada data barang keluar."}
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground text-center">
                  Data barang keluar tidak ditemukan.
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="text-center">{startIndex + index + 1}</TableCell>
                  <TableCell className="max-w-36 truncate whitespace-nowrap">{row.type}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono">{row.imei}</TableCell>
                  <TableCell className="max-w-36 truncate whitespace-nowrap">{row.pembeli}</TableCell>
                  <TableCell className="max-w-36 truncate whitespace-nowrap">{formatRupiah(Number(row.harga_modal))}</TableCell>
                  <TableCell className="max-w-36 truncate whitespace-nowrap">{formatRupiah(Number(row.harga_jual))}</TableCell>
                  <TableCell className="max-w-36 truncate whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatRupiah(Number(row.keuntungan ?? 0))}
                  </TableCell>
                  <TableCell className="max-w-36 truncate whitespace-nowrap">{formatLocalDateOnly(row.tanggal_keluar)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditCandidate(row)}
                        aria-label="Edit transaksi"
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
                        aria-label="Hapus transaksi"
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
            <span className="text-xs text-muted-foreground sm:text-sm">Total Riwayat: {totalFilteredRows}</span>
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

      <ConfirmDialog
        open={Boolean(deleteCandidateId)}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidateId(null);
        }}
        title="Hapus Barang Keluar"
        description="Data transaksi akan dihapus permanen. Lanjutkan?"
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
        title="Edit Transaksi"
        description="Masuk mode edit transaksi ini?"
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
