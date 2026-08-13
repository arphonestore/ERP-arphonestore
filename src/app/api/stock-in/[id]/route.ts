import { requireApiAuth } from "@/lib/api-auth";
import { idParamSchema, stockInMutationSchema } from "@/lib/api/contracts";
import { inventoryRpc } from "@/lib/api/database";
import {
  actorFromSession,
  apiErrorResponse,
  jsonNoStore,
  parseJsonBody,
  parseRouteId,
} from "@/lib/api/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StockIn } from "@/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const { id } = await params;
  const parsedId = parseRouteId(id, idParamSchema);
  if (!parsedId.ok) return parsedId.response;

  const parsedBody = await parseJsonBody(request, stockInMutationSchema);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;

  try {
    const result = await inventoryRpc<StockIn>(getSupabaseAdmin(), "update_stock_in", {
      p_stock_in_id: parsedId.data,
      p_type: body.type,
      p_imei: body.imei,
      p_harga: body.harga,
      p_penjual: body.penjual,
      p_tanggal_masuk: body.tanggal_masuk,
      ...actorFromSession(authResult.session.user),
    });

    if (result.error) throw result.error;
    if (!result.data) throw new Error("RPC update_stock_in tidak mengembalikan data.");

    return jsonNoStore(result.data);
  } catch (error) {
    return apiErrorResponse(error, "stock-in.[id].PUT");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const { id } = await params;
  const parsedId = parseRouteId(id, idParamSchema);
  if (!parsedId.ok) return parsedId.response;

  try {
    const result = await inventoryRpc<StockIn>(getSupabaseAdmin(), "void_stock_in", {
      p_stock_in_id: parsedId.data,
      ...actorFromSession(authResult.session.user),
    });

    if (result.error) throw result.error;
    if (!result.data) throw new Error("RPC void_stock_in tidak mengembalikan data.");

    return jsonNoStore({ success: true, data: result.data });
  } catch (error) {
    return apiErrorResponse(error, "stock-in.[id].DELETE");
  }
}
