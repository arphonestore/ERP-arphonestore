import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Stock, StockIn, StockOut } from "@/types";

type DailySummary = {
  tanggal: string;
  omzet: number;
  profit: number;
  transaksi: number;
};

type PeriodOption = {
  key: string;
  year: number;
  month: number;
  label: string;
};

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function buildMonthDateRange(periodKey: string) {
  const [yearText, monthText] = periodKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(daysInMonth)}`,
    year,
    month,
  };
}

function buildPreviousMonthRange(year: number, month: number) {
  const previousMonthDate = new Date(year, month - 2, 1);
  const previousYear = previousMonthDate.getFullYear();
  const previousMonth = previousMonthDate.getMonth() + 1;
  const daysInPreviousMonth = new Date(previousYear, previousMonth, 0).getDate();

  return {
    from: `${previousYear}-${pad2(previousMonth)}-01`,
    to: `${previousYear}-${pad2(previousMonth)}-${pad2(daysInPreviousMonth)}`,
    year: previousYear,
    month: previousMonth,
  };
}

function toPeriodOptions(stockInRows: StockIn[], stockOutRows: StockOut[]): PeriodOption[] {
  const periodKeys = new Set<string>();

  for (const row of stockInRows) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.tanggal_masuk)) {
      periodKeys.add(row.tanggal_masuk.slice(0, 7));
    }
  }

  for (const row of stockOutRows) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.tanggal_keluar)) {
      periodKeys.add(row.tanggal_keluar.slice(0, 7));
    }
  }

  return [...periodKeys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const parsed = buildMonthDateRange(key);
      if (!parsed) {
        return null;
      }

      return {
        key,
        year: parsed.year,
        month: parsed.month,
        label: new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString("id-ID", {
          month: "long",
          year: "numeric",
        }),
      } satisfies PeriodOption;
    })
    .filter((option): option is PeriodOption => option !== null);
}

function normalizeRange(fromParam: string | null, toParam: string | null, fallbackPeriodKey?: string) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const fallback = fallbackPeriodKey ? buildMonthDateRange(fallbackPeriodKey) : null;
  const fallbackFrom = fallback?.from ?? toIsoDate(monthStart);
  const fallbackTo = fallback?.to ?? toIsoDate(today);

  const validDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  const from = validDatePattern.test(fromParam ?? "") ? (fromParam as string) : fallbackFrom;
  const to = validDatePattern.test(toParam ?? "") ? (toParam as string) : fallbackTo;

  if (from <= to) {
    return { from, to };
  }

  return { from: to, to: from };
}

export async function GET(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const [{ data: stock, error: stockError }, { data: stockIn, error: stockInError }, { data: stockOut, error: stockOutError }] =
    await Promise.all([
      supabaseAdmin.from("stock").select("*"),
      supabaseAdmin.from("stock_in").select("id, tanggal_masuk"),
      supabaseAdmin
        .from("stock_out")
        .select("id, type, imei, pembeli, harga_modal, harga_jual, keuntungan, tanggal_keluar, created_at")
        .order("created_at", { ascending: false }),
    ]);

  if (stockError || stockInError || stockOutError) {
    const message = stockError?.message ?? stockInError?.message ?? stockOutError?.message ?? "Unknown Supabase error";

    return NextResponse.json(
      {
        message,
        hint: /invalid api key/i.test(message)
          ? "Periksa NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local"
          : undefined,
      },
      { status: 500 }
    );
  }

  const stockRows = (stock ?? []) as Stock[];
  const stockInRows = (stockIn ?? []) as StockIn[];
  const stockOutRows = (stockOut ?? []) as StockOut[];
  const availablePeriods = toPeriodOptions(stockInRows, stockOutRows);
  const latestPeriod = availablePeriods.at(-1);
  const { from, to } = normalizeRange(fromParam, toParam, latestPeriod?.key);
  const stockInFiltered = stockInRows.filter((item) => item.tanggal_masuk >= from && item.tanggal_masuk <= to);
  const stockOutFiltered = stockOutRows.filter((item) => item.tanggal_keluar >= from && item.tanggal_keluar <= to);

  const totalStock = stockRows.filter((item) => item.status === "available").length;
  const totalMasuk = stockInFiltered.length;
  const totalKeluar = stockOutFiltered.length;
  const currentYear = new Date().getFullYear();
  const totalOmzet = stockOutRows
    .filter((item) => item.tanggal_keluar.startsWith(`${currentYear}-`))
    .reduce((sum, item) => sum + Number(item.harga_jual ?? 0), 0);

  const omzetPeriode = stockOutFiltered.reduce((sum, item) => sum + Number(item.harga_jual ?? 0), 0);
  const profitBersihPeriode = stockOutFiltered.reduce((sum, item) => sum + Number(item.keuntungan ?? 0), 0);
  const modalPutarPeriode = stockOutFiltered.reduce((sum, item) => sum + Number(item.harga_modal ?? 0), 0);
  const modalPeriode = modalPutarPeriode + profitBersihPeriode;
  const profitRoiPersen = modalPutarPeriode > 0 ? (profitBersihPeriode / modalPutarPeriode) * 100 : 0;

  const groupedByDate = stockOutFiltered.reduce<Record<string, DailySummary>>((acc, item) => {
    const key = item.tanggal_keluar;

    if (!acc[key]) {
      acc[key] = {
        tanggal: key,
        omzet: 0,
        profit: 0,
        transaksi: 0,
      };
    }

    acc[key].omzet += Number(item.harga_jual ?? 0);
    acc[key].profit += Number(item.keuntungan ?? 0);
    acc[key].transaksi += 1;

    return acc;
  }, {});

  const chartSeries = Object.values(groupedByDate)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  const selectedPeriod = availablePeriods.find((period) => from.startsWith(period.key)) ?? latestPeriod ?? null;
  const selectedYear = Number(from.slice(0, 4));
  const selectedMonth = Number(from.slice(5, 7));
  const previousMonthRange =
    Number.isFinite(selectedYear) && Number.isFinite(selectedMonth) && selectedMonth >= 1 && selectedMonth <= 12
      ? buildPreviousMonthRange(selectedYear, selectedMonth)
      : null;

  const previousMonthProfit = previousMonthRange
    ? stockOutRows
        .filter((item) => item.tanggal_keluar >= previousMonthRange.from && item.tanggal_keluar <= previousMonthRange.to)
        .reduce((sum, item) => sum + Number(item.keuntungan ?? 0), 0)
    : 0;

  const profitChangePercentage =
    previousMonthProfit === 0
      ? profitBersihPeriode === 0
        ? 0
        : 100
      : ((profitBersihPeriode - previousMonthProfit) / Math.abs(previousMonthProfit)) * 100;

  const profitTrend: "up" | "down" | "flat" =
    profitBersihPeriode > previousMonthProfit ? "up" : profitBersihPeriode < previousMonthProfit ? "down" : "flat";

  return NextResponse.json({
    period: {
      from,
      to,
    },
    selectedPeriod,
    availablePeriods,
    kpi: {
      total_stock: totalStock,
      total_masuk: totalMasuk,
      total_keluar: totalKeluar,
      total_omzet: totalOmzet,
      omzet_periode: omzetPeriode,
      profit_bersih_periode: profitBersihPeriode,
      modal_putar_periode: modalPutarPeriode,
      modal_periode: modalPeriode,
      profit_roi_persen: profitRoiPersen,
      profit_bulan_lalu: previousMonthProfit,
      profit_perubahan_persen: profitChangePercentage,
      profit_tren: profitTrend,
    },
    chartSeries,
    recentStockOut: stockOutFiltered.slice(0, 15),
  });
}
