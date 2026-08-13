import { requireApiAuth } from "@/lib/api-auth";
import { stockInMutationSchema, listQuerySchema } from "@/lib/api/contracts";
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
import type { StockIn } from "@/types";

function stockInQuery(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  filters: { from?: string; to?: string; search?: string }
): RangeQueryFactory<StockIn> {
  return ({ count, head }) => {
    let query = supabase
      .from("stock_in")
      .select(
        "id, stock_id, type, imei, harga, penjual, tanggal_masuk, voided_at, created_at",
        { count, head }
      )
      .is("voided_at", null);

    if (filters.from) query = query.gte("tanggal_masuk", filters.from);
    if (filters.to) query = query.lte("tanggal_masuk", filters.to);

    if (filters.search) {
      const search = escapePostgrestSearch(filters.search);
      query = query.or(
        `type.ilike.%${search}%,imei.ilike.%${search}%,penjual.ilike.%${search}%`
      );
    }

    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }) as unknown as QueryBuilder<StockIn>;
  };
}

export async function GET(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const parsedQuery = parseSearchParams(request, listQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;

  const { page, pageSize, paginated, from, to, search } = parsedQuery.data;

  try {
    const buildQuery = stockInQuery(getSupabaseAdmin(), { from, to, search });

    if (paginated) {
      const result = await fetchPage(buildQuery, page, pageSize);
      return jsonNoStore({
        data: result.data,
        pagination: paginationMetadata(page, pageSize, result.total),
      });
    }

    const result = await fetchAllPagesWithCount(buildQuery, { label: "Data barang masuk" });
    return jsonNoStore(result.data, {
      headers: { "X-Total-Count": String(result.total) },
    });
  } catch (error) {
    return apiErrorResponse(error, "stock-in.GET");
  }
}

export async function POST(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const parsedBody = await parseJsonBody(request, stockInMutationSchema);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;

  try {
    const result = await inventoryRpc<StockIn>(getSupabaseAdmin(), "create_stock_in", {
      p_type: body.type,
      p_imei: body.imei,
      p_harga: body.harga,
      p_penjual: body.penjual,
      p_tanggal_masuk: body.tanggal_masuk,
      ...actorFromSession(authResult.session.user),
    });

    if (result.error) throw result.error;
    if (!result.data) throw new Error("RPC create_stock_in tidak mengembalikan data.");

    return jsonNoStore(result.data, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "stock-in.POST");
  }
}
