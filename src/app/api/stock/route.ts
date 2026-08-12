import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity-log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("stock")
    .select("*")
    .eq("status", "available")
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

  const { data, error } = await supabaseAdmin
    .from("stock")
    .insert(
      {
        type: body.type,
        imei: body.imei,
        harga: Number(body.harga),
        status: body.status ?? "available",
      } as never
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  await logActivity({
    supabase: supabaseAdmin,
    user: authResult.session.user,
    action: "create",
    module: "stock",
    entityId: (data as { id: string }).id,
    entityLabel: `${body.type} (${body.imei})`,
    description: "Menambahkan data stock baru.",
    afterData: data as Record<string, unknown>,
  });

  return NextResponse.json(data, { status: 201 });
}
