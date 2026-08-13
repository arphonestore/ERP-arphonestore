import { requireApiAuth } from "@/lib/api-auth";
import {
  escapePostgrestSearch,
  fetchAllPagesWithCount,
  fetchPage,
  paginationMetadata,
  type QueryBuilder,
  type RangeQueryFactory,
} from "@/lib/api/database";
import { stockListQuerySchema } from "@/lib/api/contracts";
import {
  apiErrorResponse,
  jsonNoStore,
  methodNotAllowed,
  parseSearchParams,
} from "@/lib/api/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Stock } from "@/types";

function stockQuery(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  filters: { status: "available" | "sold" | "all"; search?: string }
): RangeQueryFactory<Stock> {
  return ({ count, head }) => {
    let query = supabase
      .from("stock")
      .select("id, type, imei, harga, status, archived_at, created_at", { count, head })
      .is("archived_at", null);

    if (filters.status !== "all") {
      query = query.eq("status", filters.status);
    }

    if (filters.search) {
      const search = escapePostgrestSearch(filters.search);
      query = query.or(`type.ilike.%${search}%,imei.ilike.%${search}%`);
    }

    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }) as unknown as QueryBuilder<Stock>;
  };
}

export async function GET(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const parsedQuery = parseSearchParams(request, stockListQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;

  const { page, pageSize, paginated, search, status } = parsedQuery.data;

  try {
    const buildQuery = stockQuery(getSupabaseAdmin(), { status, search });

    if (paginated) {
      const result = await fetchPage(buildQuery, page, pageSize);
      return jsonNoStore({
        data: result.data,
        pagination: paginationMetadata(page, pageSize, result.total),
      });
    }

    const result = await fetchAllPagesWithCount(buildQuery, { label: "Data stock" });
    return jsonNoStore(result.data, {
      headers: { "X-Total-Count": String(result.total) },
    });
  } catch (error) {
    return apiErrorResponse(error, "stock.GET");
  }
}

export async function POST() {
  return methodNotAllowed(["GET"]);
}
