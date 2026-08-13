import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { createRequestLogger } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const avatarBucket = "profile-avatars";
const pageSize = 1_000;
const cleanupGraceMilliseconds = 5 * 60 * 1_000;
const safeStorageFolder = /^[A-Za-z0-9_-]{1,128}$/;
const safeStorageFileName = /^[A-Za-z0-9._-]{1,255}$/;

type RequestLogger = ReturnType<typeof createRequestLogger>;

function apiResponse(logger: RequestLogger, body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Correlation-ID": logger.correlationId,
    },
  });
}

function authenticatedResponse(response: NextResponse, logger: RequestLogger) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Correlation-ID", logger.correlationId);
  return response;
}

function extractOwnedStoragePath(publicUrl: string | null, profileId: string) {
  if (!publicUrl || !safeStorageFolder.test(profileId)) return null;

  try {
    const url = new URL(publicUrl);
    const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (configuredUrl && url.origin !== new URL(configuredUrl).origin) return null;

    const marker = `/storage/v1/object/public/${avatarBucket}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    const [folder, fileName, extra] = path.split("/");

    if (folder !== profileId || !fileName || extra || !safeStorageFileName.test(fileName)) {
      return null;
    }

    return `${folder}/${fileName}`;
  } catch {
    return null;
  }
}

function isOldEnough(createdAt: string | null | undefined, cutoffTime: number) {
  if (!createdAt) return false;
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && timestamp <= cutoffTime;
}

export async function POST(request: Request) {
  const logger = createRequestLogger("api.profile.cleanup-avatars", request);

  try {
    const authResult = await requireApiAuth();
    if (!authResult.ok) {
      logger.warn("request_rejected", { reason: "authentication" });
      return authenticatedResponse(authResult.response, logger);
    }

    const profileId = authResult.session.user.id;
    if (!safeStorageFolder.test(profileId)) {
      logger.error("cleanup_failed", { reason: "profile_identifier" });
      return apiResponse(logger, { message: "Pembersihan foto tidak tersedia." }, 500);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const profileResult = await supabaseAdmin
      .from("admin_profiles")
      .select("id, avatar_url")
      .eq("id", profileId)
      .maybeSingle();

    if (profileResult.error) {
      logger.error("cleanup_failed", { reason: "profile_lookup" });
      return apiResponse(logger, { message: "Foto lama tidak dapat dibersihkan." }, 500);
    }

    if (!profileResult.data) {
      logger.error("profile_missing", { reason: "configuration" });
      return apiResponse(
        logger,
        {
          message: "Profil administrator belum dikonfigurasi.",
          code: "PROFILE_NOT_CONFIGURED",
        },
        404
      );
    }

    const bucketList = await supabaseAdmin.storage.listBuckets({
      limit: 100,
      offset: 0,
      search: avatarBucket,
    });

    if (bucketList.error) {
      logger.error("cleanup_failed", { reason: "bucket_list" });
      return apiResponse(logger, { message: "Foto lama tidak dapat dibersihkan." }, 500);
    }

    const bucketExists = (bucketList.data ?? []).some(
      (bucket) => bucket.id === avatarBucket || bucket.name === avatarBucket
    );
    if (!bucketExists) {
      return apiResponse(logger, { removedCount: 0 });
    }

    const currentAvatarUrl = (profileResult.data as { avatar_url: string | null }).avatar_url;
    const keepPath = extractOwnedStoragePath(currentAvatarUrl, profileId);
    const cutoffTime = Date.now() - cleanupGraceMilliseconds;
    const stalePaths: string[] = [];
    let offset = 0;

    while (true) {
      const listResult = await supabaseAdmin.storage.from(avatarBucket).list(profileId, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (listResult.error) {
        logger.error("cleanup_failed", { reason: "object_list" });
        return apiResponse(logger, { message: "Foto lama tidak dapat dibersihkan." }, 500);
      }

      const files = listResult.data ?? [];
      for (const file of files) {
        if (!file.id || !safeStorageFileName.test(file.name)) continue;

        const path = `${profileId}/${file.name}`;
        if (path !== keepPath && isOldEnough(file.created_at, cutoffTime)) {
          stalePaths.push(path);
        }
      }

      if (files.length < pageSize) break;
      offset += files.length;
    }

    let removedCount = 0;
    for (let index = 0; index < stalePaths.length; index += pageSize) {
      const batch = stalePaths.slice(index, index + pageSize);
      const removeResult = await supabaseAdmin.storage.from(avatarBucket).remove(batch);

      if (removeResult.error) {
        logger.error("cleanup_failed", { reason: "object_remove", removedCount });
        return apiResponse(
          logger,
          { message: "Sebagian foto lama tidak dapat dibersihkan.", removedCount },
          500
        );
      }

      removedCount += batch.length;
    }

    logger.info("cleanup_completed", { removedCount });
    return apiResponse(logger, { removedCount });
  } catch {
    logger.error("cleanup_failed", { reason: "unexpected" });
    return apiResponse(logger, { message: "Foto lama tidak dapat dibersihkan." }, 500);
  }
}
