import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity-log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();

  const { id } = await params;
  const body = await request.json();

  const { data: beforeStockOut } = await supabaseAdmin.from("stock_out").select("*").eq("id", id).single();

  const { data, error } = await supabaseAdmin
    .from("stock_out")
    .update(
      {
        pembeli: body.pembeli,
        harga_jual: Number(body.harga_jual),
        tanggal_keluar: body.tanggal_keluar,
      } as never
    )
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const row = data as { type?: string; imei?: string };

  await logActivity({
    supabase: supabaseAdmin,
    user: authResult.session.user,
    action: "update",
    module: "stock_out",
    entityId: id,
    entityLabel: `${row.type ?? "Barang Keluar"} (${row.imei ?? "-"})`,
    description: "Memperbarui data barang keluar.",
    beforeData: (beforeStockOut ?? null) as Record<string, unknown> | null,
    afterData: data as Record<string, unknown>,
  });

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();

  const { id } = await params;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("stock_out")
    .select("id, imei, type, pembeli, harga_modal, harga_jual, tanggal_keluar, created_at")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ message: "Data barang keluar tidak ditemukan." }, { status: 404 });
  }

  const existingRow = existing as { id: string; imei: string };

  const { error } = await supabaseAdmin.from("stock_out").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const { error: stockError } = await supabaseAdmin
    .from("stock")
    .update({ status: "available" } as never)
    .eq("imei", existingRow.imei);

  if (stockError) {
    return NextResponse.json({ message: stockError.message }, { status: 400 });
  }

  await logActivity({
    supabase: supabaseAdmin,
    user: authResult.session.user,
    action: "delete",
    module: "stock_out",
    entityId: id,
    entityLabel: `${(existing as { type?: string }).type ?? "Barang Keluar"} (${existingRow.imei})`,
    description: "Menghapus data barang keluar.",
    beforeData: existing as Record<string, unknown>,
    afterData: null,
  });

  return NextResponse.json({ success: true });
}
