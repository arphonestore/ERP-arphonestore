import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizeAdminFullName } from "@/lib/admin-profile";
import { requireApiAuth } from "@/lib/api-auth";
import { createRequestLogger } from "@/lib/observability/logger";
import { hashPasswordAsync, verifyPassword } from "@/lib/password";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxAvatarBytes = 2 * 1024 * 1024;
const allowedAvatarMimes = ["image/png", "image/jpeg", "image/webp"] as const;
const avatarBucket = "profile-avatars";
const profileColumns = "id, username, full_name, avatar_url, updated_at";
const safeStorageFolder = /^[A-Za-z0-9_-]{1,128}$/;
const safeStorageFileName = /^[A-Za-z0-9._-]{1,255}$/;

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;
type RequestLogger = ReturnType<typeof createRequestLogger>;
type AvatarMime = (typeof allowedAvatarMimes)[number];

type ExistingProfile = {
  id: string;
  avatar_url: string | null;
  password_hash?: string | null;
};

type InspectedAvatar = {
  bytes: Uint8Array;
  mime: AvatarMime;
  extension: "png" | "jpg" | "webp";
};

const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(3, "Nama lengkap minimal 3 karakter.").max(200, "Nama lengkap maksimal 200 karakter."),
    username: z
      .string()
      .trim()
      .min(3, "Username minimal 3 karakter.")
      .max(30, "Username maksimal 30 karakter.")
      .regex(/^[a-zA-Z0-9_.-]+$/, "Username hanya boleh huruf, angka, titik, underscore, dan dash."),
    removeAvatar: z.boolean(),
    currentPassword: z.string().max(1_024, "Password saat ini terlalu panjang."),
    newPassword: z.union([
      z.literal(""),
      z.string().min(12, "Password baru minimal 12 karakter.").max(128, "Password baru maksimal 128 karakter."),
    ]),
  })
  .superRefine((value, context) => {
    if (value.newPassword && !value.currentPassword) {
      context.addIssue({
        code: "custom",
        path: ["currentPassword"],
        message: "Password saat ini wajib diisi untuk mengganti password.",
      });
    }
  });

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

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

async function inspectAvatar(file: File): Promise<InspectedAvatar | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes.length >= 8 && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { bytes, mime: "image/png", extension: "png" };
  }

  if (bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { bytes, mime: "image/jpeg", extension: "jpg" };
  }

  const isWebpContainer =
    bytes.length >= 16 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  const isSupportedWebpChunk =
    startsWith(bytes, [0x56, 0x50, 0x38, 0x20], 12) ||
    startsWith(bytes, [0x56, 0x50, 0x38, 0x4c], 12) ||
    startsWith(bytes, [0x56, 0x50, 0x38, 0x58], 12);

  if (isWebpContainer && isSupportedWebpChunk) {
    return { bytes, mime: "image/webp", extension: "webp" };
  }

  return null;
}

function findAvatarBucket(
  buckets: Array<{ id?: string; name?: string; public?: boolean }> | null
) {
  return (buckets ?? []).find((bucket) => bucket.id === avatarBucket || bucket.name === avatarBucket) ?? null;
}

async function makeExistingBucketPublic(supabaseAdmin: SupabaseAdmin) {
  const { error } = await supabaseAdmin.storage.updateBucket(avatarBucket, {
    // Existing avatar_url values are public URLs, so this bucket must remain public.
    public: true,
    fileSizeLimit: maxAvatarBytes,
    allowedMimeTypes: [...allowedAvatarMimes],
  });

  return error ? { ok: false as const, stage: "bucket_update" } : { ok: true as const };
}

async function ensureAvatarBucket(supabaseAdmin: SupabaseAdmin) {
  const initialList = await supabaseAdmin.storage.listBuckets({
    limit: 100,
    offset: 0,
    search: avatarBucket,
  });

  if (initialList.error) {
    return { ok: false as const, stage: "bucket_list" };
  }

  const existingBucket = findAvatarBucket(initialList.data);
  if (existingBucket) {
    return existingBucket.public ? { ok: true as const } : makeExistingBucketPublic(supabaseAdmin);
  }

  const createResult = await supabaseAdmin.storage.createBucket(avatarBucket, {
    // Public visibility is intentional because profiles persist getPublicUrl() values.
    public: true,
    fileSizeLimit: maxAvatarBytes,
    allowedMimeTypes: [...allowedAvatarMimes],
  });

  if (!createResult.error) {
    return { ok: true as const };
  }

  // A concurrent request may have created the bucket after the first list operation.
  const retryList = await supabaseAdmin.storage.listBuckets({
    limit: 100,
    offset: 0,
    search: avatarBucket,
  });

  if (retryList.error) {
    return { ok: false as const, stage: "bucket_create" };
  }

  const concurrentlyCreatedBucket = findAvatarBucket(retryList.data);
  if (!concurrentlyCreatedBucket) {
    return { ok: false as const, stage: "bucket_create" };
  }

  return concurrentlyCreatedBucket.public
    ? { ok: true as const }
    : makeExistingBucketPublic(supabaseAdmin);
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

async function removeUploadedAvatar(
  supabaseAdmin: SupabaseAdmin,
  path: string,
  logger: RequestLogger,
  event: string
) {
  const { error } = await supabaseAdmin.storage.from(avatarBucket).remove([path]);
  if (error) {
    logger.error(event, { reason: "storage_remove" });
    return false;
  }

  return true;
}

export async function GET(request: Request) {
  const logger = createRequestLogger("api.profile.get", request);

  try {
    const authResult = await requireApiAuth();
    if (!authResult.ok) {
      logger.warn("request_rejected", { reason: "authentication" });
      return authenticatedResponse(authResult.response, logger);
    }

    const profileId = authResult.session.user.id;
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("admin_profiles")
      .select(profileColumns)
      .eq("id", profileId)
      .maybeSingle();

    if (error) {
      logger.error("profile_lookup_failed", { reason: "database" });
      return apiResponse(logger, { message: "Profil tidak dapat dimuat." }, 500);
    }

    if (!data) {
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

    return apiResponse(logger, data);
  } catch {
    logger.error("profile_lookup_failed", { reason: "unavailable" });
    return apiResponse(logger, { message: "Profil tidak dapat dimuat." }, 500);
  }
}

export async function PUT(request: Request) {
  const logger = createRequestLogger("api.profile.put", request);

  try {
    const authResult = await requireApiAuth();
    if (!authResult.ok) {
      logger.warn("request_rejected", { reason: "authentication" });
      return authenticatedResponse(authResult.response, logger);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      logger.warn("profile_validation_failed", { reason: "multipart_form" });
      return apiResponse(logger, { message: "Data profil tidak valid." }, 400);
    }

    const parsed = updateProfileSchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
      username: String(formData.get("username") ?? ""),
      removeAvatar: String(formData.get("removeAvatar") ?? "false") === "true",
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
    });

    if (!parsed.success) {
      logger.warn("profile_validation_failed", { reason: "fields" });
      return apiResponse(
        logger,
        { message: parsed.error.issues[0]?.message ?? "Data profil tidak valid." },
        400
      );
    }

    const profileId = authResult.session.user.id;
    const changingPassword = parsed.data.newPassword.length > 0;
    const supabaseAdmin = getSupabaseAdmin();
    const existingColumns = changingPassword
      ? "id, avatar_url, password_hash"
      : "id, avatar_url";
    const existingResult = await supabaseAdmin
      .from("admin_profiles")
      .select(existingColumns)
      .eq("id", profileId)
      .maybeSingle();

    if (existingResult.error) {
      logger.error("profile_lookup_failed", { reason: "database" });
      return apiResponse(logger, { message: "Profil tidak dapat diperbarui." }, 500);
    }

    if (!existingResult.data) {
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

    const existingProfile = existingResult.data as unknown as ExistingProfile;
    let nextPasswordHash: string | undefined;

    if (changingPassword) {
      const existingPasswordHash = existingProfile.password_hash;
      if (!existingPasswordHash) {
        logger.error("password_change_failed", { reason: "password_not_configured" });
        return apiResponse(logger, { message: "Password akun belum dapat diubah." }, 409);
      }

      if (!(await verifyPassword(parsed.data.currentPassword, existingPasswordHash))) {
        logger.warn("password_change_failed", { reason: "current_password_mismatch" });
        return apiResponse(logger, { message: "Password saat ini tidak sesuai." }, 400);
      }

      if (parsed.data.newPassword === parsed.data.currentPassword) {
        logger.warn("password_change_failed", { reason: "password_reuse" });
        return apiResponse(logger, { message: "Password baru harus berbeda dari password saat ini." }, 400);
      }

      nextPasswordHash = await hashPasswordAsync(parsed.data.newPassword);
    }

    const avatarFileEntry = formData.get("avatar");
    const avatarFile = avatarFileEntry instanceof File && avatarFileEntry.size > 0 ? avatarFileEntry : null;
    let inspectedAvatar: InspectedAvatar | null = null;

    if (avatarFile) {
      if (avatarFile.size > maxAvatarBytes) {
        return apiResponse(logger, { message: "Ukuran foto maksimal 2MB." }, 400);
      }

      const declaredMime = avatarFile.type.toLowerCase();
      if (!allowedAvatarMimes.includes(declaredMime as AvatarMime)) {
        return apiResponse(logger, { message: "Format foto harus PNG, JPG/JPEG, atau WEBP." }, 400);
      }

      inspectedAvatar = await inspectAvatar(avatarFile);
      if (!inspectedAvatar || inspectedAvatar.mime !== declaredMime) {
        logger.warn("avatar_validation_failed", { reason: "content_signature" });
        return apiResponse(logger, { message: "Isi file foto tidak sesuai format PNG, JPG/JPEG, atau WEBP." }, 400);
      }
    }

    const currentAvatarUrl = existingProfile.avatar_url ?? null;
    let nextAvatarUrl = parsed.data.removeAvatar && !avatarFile ? null : currentAvatarUrl;
    let uploadedPath: string | null = null;

    if (avatarFile && inspectedAvatar) {
      if (!safeStorageFolder.test(profileId)) {
        logger.error("avatar_upload_failed", { reason: "profile_identifier" });
        return apiResponse(logger, { message: "Foto profil tidak dapat diperbarui." }, 500);
      }

      const bucketResult = await ensureAvatarBucket(supabaseAdmin);
      if (!bucketResult.ok) {
        logger.error("avatar_upload_failed", { reason: bucketResult.stage });
        return apiResponse(logger, { message: "Penyimpanan foto profil tidak tersedia." }, 500);
      }

      uploadedPath = `${profileId}/${randomUUID()}.${inspectedAvatar.extension}`;
      const uploadResult = await supabaseAdmin.storage
        .from(avatarBucket)
        .upload(uploadedPath, inspectedAvatar.bytes, {
          contentType: inspectedAvatar.mime,
          upsert: false,
        });

      if (uploadResult.error) {
        logger.error("avatar_upload_failed", { reason: "storage_upload" });
        return apiResponse(logger, { message: "Foto profil gagal diunggah." }, 500);
      }

      nextAvatarUrl = supabaseAdmin.storage.from(avatarBucket).getPublicUrl(uploadedPath).data.publicUrl;
    }

    const updatePayload: {
      username: string;
      full_name: string;
      avatar_url: string | null;
      password_hash?: string;
    } = {
      username: parsed.data.username,
      full_name: normalizeAdminFullName(parsed.data.fullName) ?? parsed.data.fullName,
      avatar_url: nextAvatarUrl,
    };

    if (nextPasswordHash) {
      updatePayload.password_hash = nextPasswordHash;
    }

    type ProfileUpdateRpcResult = {
      data: Array<{
        id: string;
        username: string;
        full_name: string | null;
        avatar_url: string | null;
        updated_at: string;
        session_version: number;
      }> | null;
      error: { code?: string; message?: string } | null;
    };

    const actorName = (
      authResult.session.user.name?.trim() ||
      authResult.session.user.username?.trim() ||
      profileId
    ).slice(0, 200);
    const updateResult = (await (
      supabaseAdmin as unknown as {
        rpc(name: string, args: Record<string, unknown>): PromiseLike<ProfileUpdateRpcResult>;
      }
    ).rpc("update_admin_profile", {
      p_profile_id: profileId,
      p_username: updatePayload.username,
      p_full_name: updatePayload.full_name,
      p_avatar_url: updatePayload.avatar_url,
      p_new_password_hash: nextPasswordHash ?? null,
      p_expected_password_hash: changingPassword ? existingProfile.password_hash ?? null : null,
      p_actor_id: profileId,
      p_actor_name: actorName,
    })) as ProfileUpdateRpcResult;
    const updatedProfile = updateResult.data?.[0] ?? null;

    if (updateResult.error || !updatedProfile) {
      if (uploadedPath) {
        await removeUploadedAvatar(
          supabaseAdmin,
          uploadedPath,
          logger,
          "avatar_rollback_failed"
        );
      }

      if (updateResult.error) {
        logger.error("profile_update_failed", {
          reason: "database",
          databaseCode: updateResult.error.code ?? "unknown",
        });

        if (updateResult.error.code === "23505") {
          return apiResponse(logger, { message: "Username sudah digunakan." }, 409);
        }

        if (updateResult.error.code === "40001") {
          return apiResponse(logger, { message: "Profil berubah secara bersamaan. Muat ulang lalu coba lagi." }, 409);
        }
      } else {
        logger.warn("profile_update_failed", { reason: "concurrent_change" });
      }

      return apiResponse(
        logger,
        { message: changingPassword ? "Profil berubah. Muat ulang lalu coba lagi." : "Profil tidak dapat diperbarui." },
        changingPassword ? 409 : 500
      );
    }

    const oldAvatarPath = extractOwnedStoragePath(currentAvatarUrl, profileId);
    const avatarChanged = Boolean(avatarFile) || (parsed.data.removeAvatar && !avatarFile);
    let avatarCleanupPending = false;

    if (avatarChanged && oldAvatarPath && oldAvatarPath !== uploadedPath) {
      avatarCleanupPending = !(await removeUploadedAvatar(
        supabaseAdmin,
        oldAvatarPath,
        logger,
        "old_avatar_cleanup_failed"
      ));
    }

    logger.info("profile_updated", {
      passwordChanged: changingPassword,
      avatarChanged,
      avatarCleanupPending,
    });

    return apiResponse(logger, {
      ...updatedProfile,
      sessionInvalidated: changingPassword,
      avatarCleanupPending,
    });
  } catch {
    logger.error("profile_update_failed", { reason: "unexpected" });
    return apiResponse(logger, { message: "Profil tidak dapat diperbarui." }, 500);
  }
}
