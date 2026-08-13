import { requireApiAuth } from "@/lib/api-auth";
import {
  idempotencyKeySchema,
  listQuerySchema,
  stockOutCheckoutSchema,
} from "@/lib/api/contracts";
import {
  escapePostgrestSearch,
  fetchAllPagesWithCount,
  fetchPage,
  inventoryRpc,
  paginationMetadata,
  type QueryBuilder,
  type RangeQueryFactory,
} from "@/lib/api/database";
import {
  actorFromSession,
  apiErrorResponse,
  jsonNoStore,
  parseJsonBody,
  parseSearchParams,
} from "@/lib/api/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StockOut } from "@/types";

function stockOutQuery(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  filters: { from?: string; to?: string; search?: string }
): RangeQueryFactory<StockOut> {
  return ({ count, head }) => {
    let query = supabase
      .from("stock_out")
      .select(
        "id, stock_id, type, imei, pembeli, harga_modal, harga_jual, keuntungan, tanggal_keluar, voided_at, idempotency_key, created_at",
        { count, head }
      )
      .is("voided_at", null);

    if (filters.from) query = query.gte("tanggal_keluar", filters.from);
    if (filters.to) query = query.lte("tanggal_keluar", filters.to);

    if (filters.search) {
      const search = escapePostgrestSearch(filters.search);
      query = query.or(
        `type.ilike.%${search}%,imei.ilike.%${search}%,pembeli.ilike.%${search}%`
      );
    }

    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }) as unknown as QueryBuilder<StockOut>;
  };
}

export async function GET(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const parsedQuery = parseSearchParams(request, listQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;

  const { page, pageSize, paginated, from, to, search } = parsedQuery.data;

  try {
    const buildQuery = stockOutQuery(getSupabaseAdmin(), { from, to, search });

    if (paginated) {
      const result = await fetchPage(buildQuery, page, pageSize);
      return jsonNoStore({
        data: result.data,
        pagination: paginationMetadata(page, pageSize, result.total),
      });
    }

    const result = await fetchAllPagesWithCount(buildQuery, { label: "Data barang keluar" });
    return jsonNoStore(result.data, {
      headers: { "X-Total-Count": String(result.total) },
    });
  } catch (error) {
    return apiErrorResponse(error, "stock-out.GET");
  }
}

export async function POST(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const parsedKey = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!parsedKey.success) {
    return jsonNoStore(
      { message: parsedKey.error.issues[0]?.message ?? "Header Idempotency-Key tidak valid." },
      { status: 400 }
    );
  }

  const parsedBody = await parseJsonBody(request, stockOutCheckoutSchema);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;

  try {
    const result = await inventoryRpc<StockOut>(getSupabaseAdmin(), "checkout_stock_out", {
      p_imei: body.imei,
      p_pembeli: body.pembeli,
      p_harga_jual: body.harga_jual,
      p_tanggal_keluar: body.tanggal_keluar,
      p_idempotency_key: parsedKey.data,
      ...actorFromSession(authResult.session.user),
    });

    if (result.error) throw result.error;
    if (!result.data) throw new Error("RPC checkout_stock_out tidak mengembalikan data.");

    // 200 is intentional for both first checkout and an idempotent replay because the RPC
    // returns the same durable transaction and does not expose whether this call created it.
    return jsonNoStore(result.data, {
      status: 200,
      headers: { "Idempotency-Key": parsedKey.data },
    });
  } catch (error) {
    return apiErrorResponse(error, "stock-out.POST");
  }
}
