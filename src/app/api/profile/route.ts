import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/api-auth";
import { hashPassword } from "@/lib/password";
import { normalizeAdminFullName } from "@/lib/admin-profile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const maxAvatarBytes = 2 * 1024 * 1024;
const allowedAvatarMimes = ["image/png", "image/jpeg", "image/webp"];
const avatarBucket = "profile-avatars";

type ProfilePayload = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  updated_at: string;
};

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(3, "Nama lengkap minimal 3 karakter."),
  username: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter.")
    .max(30, "Username maksimal 30 karakter.")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username hanya boleh huruf, angka, titik, underscore, dan dash."),
  removeAvatar: z.boolean().optional(),
  password: z.string().min(6, "Password minimal 6 karakter.").optional().or(z.literal("")),
});

function inferFileExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function extractStoragePath(publicUrl: string | null) {
  if (!publicUrl) return null;

  const marker = `/storage/v1/object/public/${avatarBucket}/`;
  const markerIndex = publicUrl.indexOf(marker);

  if (markerIndex < 0) {
    return null;
  }

  return publicUrl.slice(markerIndex + marker.length);
}

async function ensureAvatarBucket() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: bucket } = await supabaseAdmin.storage.getBucket(avatarBucket);

  if (bucket) {
    return;
  }

  await supabaseAdmin.storage.createBucket(avatarBucket, {
    public: true,
    fileSizeLimit: maxAvatarBytes,
    allowedMimeTypes: allowedAvatarMimes,
  });
}

async function resolveProfileId(userId: string, username: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const byIdResult = await supabaseAdmin
    .from("admin_profiles")
    .select("id")
    .eq("id", userId)
    .single();

  const byId = (byIdResult.data ?? null) as { id: string } | null;

  if (byId?.id) {
    return byId.id;
  }

  const byUsernameResult = await supabaseAdmin
    .from("admin_profiles")
    .select("id")
    .eq("username", username)
    .single();

  const byUsername = (byUsernameResult.data ?? null) as { id: string } | null;

  if (byUsername?.id) {
    return byUsername.id;
  }

  return userId;
}

export async function GET() {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();
  const userId = authResult.session.user.id;
  const username = authResult.session.user.username ?? "admin";
  const profileId = await resolveProfileId(userId, username);

  const { data, error } = await supabaseAdmin
    .from("admin_profiles")
    .select("id, username, full_name, avatar_url, updated_at")
    .eq("id", profileId)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (!data) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("admin_profiles")
      .insert(
        {
          id: profileId,
          username,
          full_name: authResult.session.user.name ?? "Admin AR Store",
          avatar_url: null,
        } as never
      )
      .select("id, username, full_name, avatar_url, updated_at")
      .single();

    if (insertError) {
      return NextResponse.json({ message: insertError.message }, { status: 500 });
    }

    return NextResponse.json(inserted);
  }

  const profile = data as ProfilePayload;
  const normalizedFullName = normalizeAdminFullName(profile.full_name);

  if (normalizedFullName !== profile.full_name) {
    const { data: normalizedProfile, error: normalizeError } = await supabaseAdmin
      .from("admin_profiles")
      .update({ full_name: normalizedFullName } as never)
      .eq("id", profileId)
      .select("id, username, full_name, avatar_url, updated_at")
      .single();

    if (normalizeError) {
      return NextResponse.json({ message: normalizeError.message }, { status: 500 });
    }

    return NextResponse.json(normalizedProfile);
  }

  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();
  const userId = authResult.session.user.id;
  const currentUsername = authResult.session.user.username ?? "admin";

  const formData = await request.formData();
  const parsed = updateProfileSchema.safeParse({
    fullName: String(formData.get("fullName") ?? ""),
    username: String(formData.get("username") ?? ""),
    removeAvatar: String(formData.get("removeAvatar") ?? "false") === "true",
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Data profil tidak valid." }, { status: 400 });
  }

  const profileId = await resolveProfileId(userId, currentUsername);

  const { data: existingProfile } = await supabaseAdmin
    .from("admin_profiles")
    .select("avatar_url")
    .eq("id", profileId)
    .single();

  const currentAvatarUrl = ((existingProfile as { avatar_url?: string | null } | null)?.avatar_url ?? null) as string | null;
  let nextAvatarUrl = currentAvatarUrl;

  const avatarFileEntry = formData.get("avatar");
  const avatarFile = avatarFileEntry instanceof File && avatarFileEntry.size > 0 ? avatarFileEntry : null;

  if (avatarFile) {
    if (!allowedAvatarMimes.includes(avatarFile.type)) {
      return NextResponse.json({ message: "Format foto harus PNG, JPG/JPEG, atau WEBP." }, { status: 400 });
    }

    if (avatarFile.size > maxAvatarBytes) {
      return NextResponse.json({ message: "Ukuran foto maksimal 2MB." }, { status: 400 });
    }

    await ensureAvatarBucket();

    const extension = inferFileExtension(avatarFile);
    const filePath = `${profileId}/${Date.now()}.${extension}`;

    const uploadResult = await supabaseAdmin.storage.from(avatarBucket).upload(filePath, avatarFile, {
      contentType: avatarFile.type,
      upsert: false,
    });

    if (uploadResult.error) {
      return NextResponse.json({ message: uploadResult.error.message }, { status: 400 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(avatarBucket).getPublicUrl(filePath);
    nextAvatarUrl = publicUrlData.publicUrl;

    const oldPath = extractStoragePath(currentAvatarUrl);
    if (oldPath) {
      await supabaseAdmin.storage.from(avatarBucket).remove([oldPath]);
    }
  } else if (parsed.data.removeAvatar) {
    const oldPath = extractStoragePath(currentAvatarUrl);
    if (oldPath) {
      await supabaseAdmin.storage.from(avatarBucket).remove([oldPath]);
    }
    nextAvatarUrl = null;
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

  const plainPassword = parsed.data.password?.trim();

  if (plainPassword) {
    updatePayload.password_hash = hashPassword(plainPassword);
  }

  const { data, error } = await supabaseAdmin
    .from("admin_profiles")
    .upsert(
      {
        id: profileId,
        ...updatePayload,
      } as never,
      { onConflict: "id" }
    )
    .select("id, username, full_name, avatar_url, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
