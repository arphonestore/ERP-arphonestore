import { requireApiAuth } from "@/lib/api-auth";
import { dashboardQuerySchema } from "@/lib/api/contracts";
import {
  fetchAllPages,
  fetchAllPagesWithCount,
  fetchExactCount,
  MAX_DASHBOARD_ANALYTIC_ROWS,
  type QueryBuilder,
  type RangeQueryFactory,
} from "@/lib/api/database";
import { apiErrorResponse, jsonNoStore, parseSearchParams } from "@/lib/api/http";
import {
  defaultJakartaRange,
  jakartaYear,
  monthRange,
  periodLabel,
  previousMonthRange,
} from "@/lib/api/jakarta-time";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StockOut } from "@/types";

type DateRow = {
  date: string;
};

type MoneyRow = {
  value: number;
};

type DashboardStockOut = Pick<
  StockOut,
  | "id"
  | "stock_id"
  | "type"
  | "imei"
  | "pembeli"
  | "harga_modal"
  | "harga_jual"
  | "keuntungan"
  | "tanggal_keluar"
  | "voided_at"
  | "idempotency_key"
  | "created_at"
>;

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

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

function activeStockCountQuery(supabase: SupabaseAdmin): RangeQueryFactory<never> {
  return ({ count, head }) =>
    supabase
      .from("stock")
      .select("id", { count, head })
      .eq("status", "available")
      .is("archived_at", null) as unknown as QueryBuilder<never>;
}

function activeStockInCountQuery(
  supabase: SupabaseAdmin,
  from: string,
  to: string
): RangeQueryFactory<never> {
  return ({ count, head }) =>
    supabase
      .from("stock_in")
      .select("id", { count, head })
      .is("voided_at", null)
      .gte("tanggal_masuk", from)
      .lte("tanggal_masuk", to)
      .order("id", { ascending: true }) as unknown as QueryBuilder<never>;
}

function activeStockOutQuery(
  supabase: SupabaseAdmin,
  from: string,
  to: string
): RangeQueryFactory<DashboardStockOut> {
  return ({ count, head }) =>
    supabase
      .from("stock_out")
      .select(
        "id, stock_id, type, imei, pembeli, harga_modal, harga_jual, keuntungan, tanggal_keluar, voided_at, idempotency_key, created_at",
        { count, head }
      )
      .is("voided_at", null)
      .gte("tanggal_keluar", from)
      .lte("tanggal_keluar", to)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }) as unknown as QueryBuilder<DashboardStockOut>;
}

function stockOutMoneyQuery(
  supabase: SupabaseAdmin,
  column: "harga_jual" | "keuntungan",
  from: string,
  to: string
): RangeQueryFactory<MoneyRow> {
  return ({ count, head }) =>
    supabase
      .from("stock_out")
      .select(column, { count, head })
      .is("voided_at", null)
      .gte("tanggal_keluar", from)
      .lte("tanggal_keluar", to)
      .order("tanggal_keluar", { ascending: true })
      .order("id", { ascending: true }) as unknown as QueryBuilder<MoneyRow>;
}

function transactionDateQuery(
  supabase: SupabaseAdmin,
  table: "stock_in" | "stock_out",
  dateColumn: "tanggal_masuk" | "tanggal_keluar"
): RangeQueryFactory<DateRow> {
  return ({ count, head }) =>
    supabase
      .from(table)
      .select(dateColumn, { count, head })
      .is("voided_at", null)
      .order(dateColumn, { ascending: true })
      .order("id", { ascending: true }) as unknown as QueryBuilder<DateRow>;
}

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumMoney(rows: MoneyRow[]) {
  return rows.reduce((sum, row) => sum + numericValue(Object.values(row)[0]), 0);
}

function availablePeriodOptions(stockInDates: DateRow[], stockOutDates: DateRow[]) {
  const keys = new Set<string>();

  for (const row of [...stockInDates, ...stockOutDates]) {
    const date = Object.values(row)[0];
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      keys.add(date.slice(0, 7));
    }
  }

  return [...keys]
    .sort((left, right) => left.localeCompare(right))
    .map((key): PeriodOption | null => {
      const parsed = monthRange(key);
      return parsed
        ? {
            key,
            year: parsed.year,
            month: parsed.month,
            label: periodLabel(parsed.year, parsed.month),
          }
        : null;
    })
    .filter((option): option is PeriodOption => option !== null);
}

function selectedRange(
  fromParam: string | undefined,
  toParam: string | undefined,
  latestPeriod: PeriodOption | undefined
) {
  const defaultRange = latestPeriod ? monthRange(latestPeriod.key) : defaultJakartaRange();
  if (!defaultRange) return defaultJakartaRange();

  return {
    from: fromParam ?? defaultRange.from,
    to: toParam ?? defaultRange.to,
  };
}

export async function GET(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const parsedQuery = parseSearchParams(request, dashboardQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;

  try {
    const supabase = getSupabaseAdmin();
    const [stockInDates, stockOutDates] = await Promise.all([
      fetchAllPages(transactionDateQuery(supabase, "stock_in", "tanggal_masuk"), {
        maxRows: MAX_DASHBOARD_ANALYTIC_ROWS,
        label: "Periode barang masuk",
      }),
      fetchAllPages(transactionDateQuery(supabase, "stock_out", "tanggal_keluar"), {
        maxRows: MAX_DASHBOARD_ANALYTIC_ROWS,
        label: "Periode barang keluar",
      }),
    ]);

    const availablePeriods = availablePeriodOptions(stockInDates, stockOutDates);
    const latestPeriod = availablePeriods.at(-1);
    const range = selectedRange(parsedQuery.data.from, parsedQuery.data.to, latestPeriod);

    if (range.from > range.to) {
      return jsonNoStore(
        { message: "Tanggal from tidak boleh setelah to." },
        { status: 400 }
      );
    }

    const previousRange = previousMonthRange(range.from);
    const currentYear = jakartaYear();
    const yearRange = {
      from: `${currentYear}-01-01`,
      to: `${currentYear}-12-31`,
    };

    const [
      totalStock,
      totalMasuk,
      selectedStockOut,
      currentYearSales,
      previousMonthProfits,
    ] = await Promise.all([
      fetchExactCount(activeStockCountQuery(supabase)),
      fetchExactCount(activeStockInCountQuery(supabase, range.from, range.to)),
      fetchAllPagesWithCount(activeStockOutQuery(supabase, range.from, range.to), {
        maxRows: MAX_DASHBOARD_ANALYTIC_ROWS,
        label: "Transaksi dashboard pada periode terpilih",
      }),
      fetchAllPages(
        stockOutMoneyQuery(supabase, "harga_jual", yearRange.from, yearRange.to),
        {
          maxRows: MAX_DASHBOARD_ANALYTIC_ROWS,
          label: "Transaksi omzet tahun berjalan",
        }
      ),
      previousRange
        ? fetchAllPages(
            stockOutMoneyQuery(
              supabase,
              "keuntungan",
              previousRange.from,
              previousRange.to
            ),
            {
              maxRows: MAX_DASHBOARD_ANALYTIC_ROWS,
              label: "Transaksi bulan sebelumnya",
            }
          )
        : Promise.resolve([] as MoneyRow[]),
    ]);

    const totalKeluar = selectedStockOut.total;
    const selectedStockOutRows = selectedStockOut.data;
    const totalOmzet = sumMoney(currentYearSales);
    const omzetPeriode = selectedStockOutRows.reduce(
      (sum, row) => sum + numericValue(row.harga_jual),
      0
    );
    const profitBersihPeriode = selectedStockOutRows.reduce(
      (sum, row) => sum + numericValue(row.keuntungan),
      0
    );
    const modalPutarPeriode = selectedStockOutRows.reduce(
      (sum, row) => sum + numericValue(row.harga_modal),
      0
    );
    const profitRoiPersen =
      modalPutarPeriode > 0 ? (profitBersihPeriode / modalPutarPeriode) * 100 : 0;
    const previousMonthProfit = sumMoney(previousMonthProfits);
    const profitChangePercentage =
      previousMonthProfit === 0
        ? null
        : ((profitBersihPeriode - previousMonthProfit) / Math.abs(previousMonthProfit)) * 100;
    const profitTrend: "up" | "down" | "flat" =
      profitBersihPeriode > previousMonthProfit
        ? "up"
        : profitBersihPeriode < previousMonthProfit
          ? "down"
          : "flat";

    const groupedByDate = selectedStockOutRows.reduce<Record<string, DailySummary>>(
      (summary, row) => {
        const key = row.tanggal_keluar;
        const existing = summary[key] ?? {
          tanggal: key,
          omzet: 0,
          profit: 0,
          transaksi: 0,
        };

        existing.omzet += numericValue(row.harga_jual);
        existing.profit += numericValue(row.keuntungan);
        existing.transaksi += 1;
        summary[key] = existing;
        return summary;
      },
      {}
    );

    const chartSeries = Object.values(groupedByDate).sort((left, right) =>
      left.tanggal.localeCompare(right.tanggal)
    );
    const selectedPeriod =
      availablePeriods.find((period) => range.from.startsWith(period.key)) ??
      latestPeriod ??
      null;

    return jsonNoStore({
      period: range,
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
        profit_roi_persen: profitRoiPersen,
        profit_bulan_lalu: previousMonthProfit,
        profit_perubahan_persen: profitChangePercentage,
        profit_tren: profitTrend,
      },
      chartSeries,
      recentStockOut: selectedStockOutRows.slice(0, 15),
    });
  } catch (error) {
    return apiErrorResponse(error, "dashboard.GET");
  }
}
