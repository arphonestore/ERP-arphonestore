import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity-log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("stock_in")
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
  const tanggalMasuk = String(body.tanggal_masuk ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalMasuk)) {
    return NextResponse.json({ message: "Format tanggal masuk tidak valid." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  if (tanggalMasuk > today) {
    return NextResponse.json({ message: "Tanggal masuk tidak boleh melebihi hari ini." }, { status: 400 });
  }

  const harga = Number(body.harga);

  const { data, error } = await supabaseAdmin
    .from("stock_in")
    .insert(
      {
        type: body.type,
        imei: body.imei,
        harga,
        penjual: body.penjual,
        tanggal_masuk: tanggalMasuk,
      } as never
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const { error: stockError } = await supabaseAdmin.from("stock").upsert(
    {
      type: body.type,
      imei: body.imei,
      harga,
      status: "available",
    } as never,
    { onConflict: "imei" }
  );

  if (stockError) {
    await supabaseAdmin.from("stock_in").delete().eq("id", (data as { id: string }).id);
    return NextResponse.json({ message: stockError.message }, { status: 400 });
  }

  await logActivity({
    supabase: supabaseAdmin,
    user: authResult.session.user,
    action: "create",
    module: "stock_in",
    entityId: (data as { id: string }).id,
    entityLabel: `${body.type} (${body.imei})`,
    description: "Mencatat barang masuk.",
    afterData: data as Record<string, unknown>,
  });

  return NextResponse.json(data, { status: 201 });
}
