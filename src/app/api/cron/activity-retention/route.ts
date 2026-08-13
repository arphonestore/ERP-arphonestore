import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createRequestLogger } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const defaultRetentionDays = 180;
const millisecondsPerDay = 24 * 60 * 60 * 1_000;

function responseHeaders(correlationId: string) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "X-Correlation-ID": correlationId,
  };
}

function authorized(request: Request, secret: string) {
  const supplied = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function retentionDaysFromEnvironment() {
  const configured = process.env.ACTIVITY_RETENTION_DAYS?.trim();
  if (!configured) return defaultRetentionDays;
  if (!/^\d+$/.test(configured)) return null;

  const days = Number(configured);
  return Number.isSafeInteger(days) && days >= 1 && days <= 36_500 ? days : null;
}

export async function GET(request: Request) {
  const logger = createRequestLogger("api.cron.activity-retention", request);
  const headers = responseHeaders(logger.correlationId);
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error("cron_rejected", { reason: "configuration" });
    return NextResponse.json({ message: "Service unavailable." }, { status: 503, headers });
  }

  // Vercel automatically sends CRON_SECRET as `Authorization: Bearer <CRON_SECRET>`.
  if (!authorized(request, cronSecret)) {
    logger.warn("cron_rejected", { reason: "unauthorized" });
    return NextResponse.json({ message: "Unauthorized." }, { status: 401, headers });
  }

  const retentionDays = retentionDaysFromEnvironment();
  if (retentionDays === null) {
    logger.error("cron_failed", { reason: "retention_configuration" });
    return NextResponse.json({ message: "Service unavailable." }, { status: 503, headers });
  }

  const cutoff = new Date(Date.now() - retentionDays * millisecondsPerDay).toISOString();

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // No archive store exists, so retention is an idempotent delete of rows older than the cutoff.
    const { count, error } = await supabaseAdmin
      .from("activity_logs")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);

    if (error) {
      logger.error("cron_failed", { reason: "database_delete" });
      return NextResponse.json({ message: "Retention job failed." }, { status: 500, headers });
    }

    logger.info("cron_completed", { retentionDays, deletedCount: count ?? 0 });
    return NextResponse.json(
      { success: true, retentionDays, deletedCount: count ?? 0 },
      { status: 200, headers }
    );
  } catch {
    logger.error("cron_failed", { reason: "unavailable" });
    return NextResponse.json({ message: "Retention job failed." }, { status: 500, headers });
  }
}
