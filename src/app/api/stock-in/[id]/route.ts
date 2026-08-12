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
  const tanggalMasuk = String(body.tanggal_masuk ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalMasuk)) {
    return NextResponse.json({ message: "Format tanggal masuk tidak valid." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  if (tanggalMasuk > today) {
    return NextResponse.json({ message: "Tanggal masuk tidak boleh melebihi hari ini." }, { status: 400 });
  }

  const harga = Number(body.harga);

  const { data: beforeStockInRaw } = await supabaseAdmin.from("stock_in").select("*").eq("id", id).single();
  const beforeStockIn = (beforeStockInRaw ?? null) as { imei?: string } | null;

  const { data, error } = await supabaseAdmin
    .from("stock_in")
    .update(
      {
        type: body.type,
        imei: body.imei,
        harga,
        penjual: body.penjual,
        tanggal_masuk: tanggalMasuk,
      } as never
    )
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const previousImei = typeof beforeStockIn?.imei === "string" ? beforeStockIn.imei : null;

  if (previousImei) {
    const { data: updatedStock, error: stockUpdateError } = await supabaseAdmin
      .from("stock")
      .update(
        {
          type: body.type,
          imei: body.imei,
          harga,
          status: "available",
        } as never
      )
      .eq("imei", previousImei)
      .select("id");

    if (stockUpdateError) {
      return NextResponse.json({ message: stockUpdateError.message }, { status: 400 });
    }

    if (!updatedStock || updatedStock.length === 0) {
      const { error: stockUpsertError } = await supabaseAdmin.from("stock").upsert(
        {
          type: body.type,
          imei: body.imei,
          harga,
          status: "available",
        } as never,
        { onConflict: "imei" }
      );

      if (stockUpsertError) {
        return NextResponse.json({ message: stockUpsertError.message }, { status: 400 });
      }
    }
  } else {
    const { error: stockUpsertError } = await supabaseAdmin.from("stock").upsert(
      {
        type: body.type,
        imei: body.imei,
        harga,
        status: "available",
      } as never,
      { onConflict: "imei" }
    );

    if (stockUpsertError) {
      return NextResponse.json({ message: stockUpsertError.message }, { status: 400 });
    }
  }

  await logActivity({
    supabase: supabaseAdmin,
    user: authResult.session.user,
    action: "update",
    module: "stock_in",
    entityId: id,
    entityLabel: `${body.type} (${body.imei})`,
    description: "Memperbarui data barang masuk.",
    beforeData: (beforeStockIn ?? null) as Record<string, unknown> | null,
    afterData: data as Record<string, unknown>,
  });

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();

  const { id } = await params;

  const { data: beforeStockInRaw } = await supabaseAdmin.from("stock_in").select("*").eq("id", id).single();
  const beforeStockIn = (beforeStockInRaw ?? null) as { imei?: string } | null;

  const deletedImei = typeof beforeStockIn?.imei === "string" ? beforeStockIn.imei : null;

  const { error } = await supabaseAdmin.from("stock_in").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  if (deletedImei) {
    const { data: remainingStockIn, error: remainingStockInError } = await supabaseAdmin
      .from("stock_in")
      .select("id")
      .eq("imei", deletedImei)
      .limit(1);

    if (remainingStockInError) {
      return NextResponse.json({ message: remainingStockInError.message }, { status: 400 });
    }

    if (!remainingStockIn || remainingStockIn.length === 0) {
      const { error: stockDeleteError } = await supabaseAdmin.from("stock").delete().eq("imei", deletedImei);

      if (stockDeleteError) {
        return NextResponse.json({ message: stockDeleteError.message }, { status: 400 });
      }
    }
  }

  const beforeData = (beforeStockIn ?? null) as Record<string, unknown> | null;
  const deletedType = typeof beforeData?.type === "string" ? beforeData.type : "Stock In";
  const deletedImeiLabel = typeof beforeData?.imei === "string" ? beforeData.imei : "-";

  await logActivity({
    supabase: supabaseAdmin,
    user: authResult.session.user,
    action: "delete",
    module: "stock_in",
    entityId: id,
    entityLabel: `${deletedType} (${deletedImeiLabel})`,
    description: "Menghapus data barang masuk.",
    beforeData,
    afterData: null,
  });

  return NextResponse.json({ success: true });
}
