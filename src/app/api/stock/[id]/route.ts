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

  const { data: beforeStock } = await supabaseAdmin.from("stock").select("*").eq("id", id).single();

  const { data, error } = await supabaseAdmin
    .from("stock")
    .update(
      {
        type: body.type,
        imei: body.imei,
        harga: Number(body.harga),
        status: body.status,
      } as never
    )
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  await logActivity({
    supabase: supabaseAdmin,
    user: authResult.session.user,
    action: "update",
    module: "stock",
    entityId: id,
    entityLabel: `${body.type} (${body.imei})`,
    description: "Memperbarui data stock.",
    beforeData: (beforeStock ?? null) as Record<string, unknown> | null,
    afterData: data as Record<string, unknown>,
  });

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();

  const { id } = await params;

  const { data: beforeStock } = await supabaseAdmin.from("stock").select("*").eq("id", id).single();

  const { error } = await supabaseAdmin.from("stock").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const beforeData = (beforeStock ?? null) as Record<string, unknown> | null;
  const deletedType = typeof beforeData?.type === "string" ? beforeData.type : "Stock";
  const deletedImei = typeof beforeData?.imei === "string" ? beforeData.imei : "-";

  await logActivity({
    supabase: supabaseAdmin,
    user: authResult.session.user,
    action: "delete",
    module: "stock",
    entityId: id,
    entityLabel: `${deletedType} (${deletedImei})`,
    description: "Menghapus data stock.",
    beforeData,
    afterData: null,
  });

  return NextResponse.json({ success: true });
}
