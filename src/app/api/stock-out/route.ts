import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity-log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("stock_out")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();

  const body = await request.json();
  const imei = String(body.imei ?? "").trim();

  if (!imei) {
    return NextResponse.json({ message: "IMEI wajib dipilih dari stock tersedia." }, { status: 400 });
  }

  const { data: stockItem, error: stockLookupError } = await supabaseAdmin
    .from("stock")
    .select("id, type, imei, harga, status")
    .eq("imei", imei)
    .single();

  if (stockLookupError || !stockItem) {
    return NextResponse.json({ message: "Barang stock tidak ditemukan." }, { status: 404 });
  }

  const stockRow = stockItem as { id: string; type: string; imei: string; harga: number; status: "available" | "sold" };

  if (stockRow.status !== "available") {
    return NextResponse.json({ message: "Barang sudah tidak tersedia untuk checkout." }, { status: 400 });
  }

  const hargaModal = Number(stockRow.harga);
  const hargaJual = Number(body.harga_jual);

  const { data, error } = await supabaseAdmin
    .from("stock_out")
    .insert(
      {
        type: stockRow.type,
        imei: stockRow.imei,
        pembeli: body.pembeli,
        harga_modal: hargaModal,
        harga_jual: hargaJual,
        tanggal_keluar: body.tanggal_keluar,
      } as never
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const { error: updateStockError } = await supabaseAdmin
    .from("stock")
    .update({ status: "sold" } as never)
    .eq("id", stockRow.id)
    .eq("status", "available");

  if (updateStockError) {
    await supabaseAdmin.from("stock_out").delete().eq("id", (data as { id: string }).id);
    return NextResponse.json({ message: updateStockError.message }, { status: 400 });
  }

  await logActivity({
    supabase: supabaseAdmin,
    user: authResult.session.user,
    action: "checkout",
    module: "stock_out",
    entityId: (data as { id: string }).id,
    entityLabel: `${stockRow.type} (${stockRow.imei})`,
    description: "Melakukan checkout barang keluar.",
    afterData: data as Record<string, unknown>,
  });

  return NextResponse.json(data, { status: 201 });
}
