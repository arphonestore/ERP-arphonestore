import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 2);
  const cutoffIso = cutoffDate.toISOString();

  const { error: cleanupError } = await supabaseAdmin.from("activity_logs").delete().lt("created_at", cutoffIso);

  if (cleanupError) {
    return NextResponse.json({ message: cleanupError.message }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
