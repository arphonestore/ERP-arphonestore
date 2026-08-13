import { requireApiAuth } from "@/lib/api-auth";
import { activityListQuerySchema } from "@/lib/api/contracts";
import {
  escapePostgrestSearch,
  fetchAllPagesWithCount,
  fetchPage,
  paginationMetadata,
  type QueryBuilder,
  type RangeQueryFactory,
} from "@/lib/api/database";
import { apiErrorResponse, jsonNoStore, parseSearchParams } from "@/lib/api/http";
import { startOfNextDate } from "@/lib/api/jakarta-time";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ActivityLog } from "@/types";

function activityQuery(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  filters: {
    from?: string;
    to?: string;
    search?: string;
    module?: string;
    action?: string;
  }
): RangeQueryFactory<ActivityLog> {
  return ({ count, head }) => {
    let query = supabase
      .from("activity_logs")
      .select(
        "id, actor_id, actor_name, action, module, entity_id, entity_label, description, before_data, after_data, created_at",
        { count, head }
      );

    if (filters.from) {
      query = query.gte("created_at", `${filters.from}T00:00:00+07:00`);
    }

    if (filters.to) {
      query = query.lt("created_at", `${startOfNextDate(filters.to)}T00:00:00+07:00`);
    }

    if (filters.module) query = query.eq("module", filters.module);
    if (filters.action) query = query.eq("action", filters.action);

    if (filters.search) {
      const search = escapePostgrestSearch(filters.search);
      query = query.or(
        `actor_name.ilike.%${search}%,action.ilike.%${search}%,module.ilike.%${search}%,entity_label.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }) as unknown as QueryBuilder<ActivityLog>;
  };
}

export async function GET(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const parsedQuery = parseSearchParams(request, activityListQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;

  const { page, pageSize, paginated, from, to, search, module, action } = parsedQuery.data;

  try {
    const buildQuery = activityQuery(getSupabaseAdmin(), {
      from,
      to,
      search,
      module,
      action,
    });

    if (paginated) {
      const result = await fetchPage(buildQuery, page, pageSize);
      return jsonNoStore({
        data: result.data,
        pagination: paginationMetadata(page, pageSize, result.total),
      });
    }

    const result = await fetchAllPagesWithCount(buildQuery, { label: "Activity log" });
    return jsonNoStore(result.data, {
      headers: { "X-Total-Count": String(result.total) },
    });
  } catch (error) {
    return apiErrorResponse(error, "activity.GET");
  }
}
