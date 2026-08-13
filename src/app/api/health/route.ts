import { NextResponse } from "next/server";

import { createRequestLogger } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

function hasValidConfiguration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) return false;

  try {
    const parsedUrl = new URL(supabaseUrl);
    return parsedUrl.protocol === "https:" && Boolean(parsedUrl.hostname) && !parsedUrl.username && !parsedUrl.password;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const logger = createRequestLogger("api.health", request);
  const headers = { ...noStoreHeaders, "X-Correlation-ID": logger.correlationId };

  if (!hasValidConfiguration()) {
    logger.error("readiness_failed", { reason: "configuration" });
    return NextResponse.json(
      {
        status: "unhealthy",
        checks: { configuration: "error", database: "skipped" },
      },
      { status: 503, headers }
    );
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("admin_profiles").select("id").limit(1);

    if (error) {
      logger.error("readiness_failed", { reason: "database" });
      return NextResponse.json(
        {
          status: "unhealthy",
          checks: { configuration: "ok", database: "error" },
        },
        { status: 503, headers }
      );
    }

    return NextResponse.json(
      {
        status: "healthy",
        checks: { configuration: "ok", database: "ok" },
      },
      { status: 200, headers }
    );
  } catch {
    logger.error("readiness_failed", { reason: "unavailable" });
    return NextResponse.json(
      {
        status: "unhealthy",
        checks: { configuration: "ok", database: "error" },
      },
      { status: 503, headers }
    );
  }
}
