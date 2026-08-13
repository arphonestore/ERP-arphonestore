import { z } from "zod";

import { requireApiAuth } from "@/lib/api-auth";
import { stockOutCheckoutSchema } from "@/lib/api/contracts";
import { actorFromSession, apiErrorResponse, jsonNoStore, parseJsonBody } from "@/lib/api/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StockOut } from "@/types";

const batchItemSchema = stockOutCheckoutSchema.extend({
  idempotency_key: z
    .string()
    .trim()
    .min(16, "Idempotency key minimal 16 karakter.")
    .max(200, "Idempotency key maksimal 200 karakter.")
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Idempotency key tidak valid."),
});

const batchCheckoutSchema = z
  .object({
    items: z.array(batchItemSchema).min(1, "Batch minimal berisi satu item.").max(100, "Batch maksimal 100 item."),
  })
  .strict()
  .superRefine((value, context) => {
    const imeis = new Set<string>();
    const keys = new Set<string>();

    value.items.forEach((item, index) => {
      const imei = item.imei.replace(/[\s-]+/g, "");
      if (imeis.has(imei)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "imei"],
          message: "IMEI tidak boleh duplikat dalam satu batch.",
        });
      }
      imeis.add(imei);

      if (keys.has(item.idempotency_key)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "idempotency_key"],
          message: "Idempotency key tidak boleh duplikat dalam satu batch.",
        });
      }
      keys.add(item.idempotency_key);
    });
  });

type RpcResult = {
  data: StockOut[] | null;
  error: { code?: string; message?: string; details?: string; hint?: string } | null;
};

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};

export async function POST(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const parsedBody = await parseJsonBody(request, batchCheckoutSchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const result = await (getSupabaseAdmin() as unknown as RpcClient).rpc(
      "checkout_stock_out_batch",
      {
        p_items: parsedBody.data.items,
        ...actorFromSession(authResult.session.user),
      }
    );

    if (result.error) throw result.error;
    if (!result.data || result.data.length !== parsedBody.data.items.length) {
      throw new Error("RPC checkout_stock_out_batch mengembalikan hasil tidak lengkap.");
    }

    return jsonNoStore({
      success: true,
      atomic: true,
      data: result.data,
    });
  } catch (error) {
    return apiErrorResponse(error, "stock-out.batch.POST");
  }
}
