import { requireApiAuth } from "@/lib/api-auth";
import { idParamSchema, stockOutUpdateSchema } from "@/lib/api/contracts";
import { inventoryRpc } from "@/lib/api/database";
import {
  actorFromSession,
  apiErrorResponse,
  jsonNoStore,
  parseJsonBody,
  parseRouteId,
} from "@/lib/api/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StockOut } from "@/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const { id } = await params;
  const parsedId = parseRouteId(id, idParamSchema);
  if (!parsedId.ok) return parsedId.response;

  const parsedBody = await parseJsonBody(request, stockOutUpdateSchema);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;

  try {
    const result = await inventoryRpc<StockOut>(getSupabaseAdmin(), "update_stock_out", {
      p_stock_out_id: parsedId.data,
      p_pembeli: body.pembeli,
      p_harga_jual: body.harga_jual,
      p_tanggal_keluar: body.tanggal_keluar,
      ...actorFromSession(authResult.session.user),
    });

    if (result.error) throw result.error;
    if (!result.data) throw new Error("RPC update_stock_out tidak mengembalikan data.");

    return jsonNoStore(result.data);
  } catch (error) {
    return apiErrorResponse(error, "stock-out.[id].PUT");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const { id } = await params;
  const parsedId = parseRouteId(id, idParamSchema);
  if (!parsedId.ok) return parsedId.response;

  try {
    const result = await inventoryRpc<StockOut>(getSupabaseAdmin(), "void_stock_out", {
      p_stock_out_id: parsedId.data,
      ...actorFromSession(authResult.session.user),
    });

    if (result.error) throw result.error;
    if (!result.data) throw new Error("RPC void_stock_out tidak mengembalikan data.");

    return jsonNoStore({ success: true, data: result.data });
  } catch (error) {
    return apiErrorResponse(error, "stock-out.[id].DELETE");
  }
}
