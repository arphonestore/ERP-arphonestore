import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const avatarBucket = "profile-avatars";

function extractStoragePath(publicUrl: string | null) {
  if (!publicUrl) return null;

  const marker = `/storage/v1/object/public/${avatarBucket}/`;
  const markerIndex = publicUrl.indexOf(marker);

  if (markerIndex < 0) {
    return null;
  }

  return publicUrl.slice(markerIndex + marker.length);
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

export async function POST() {
  const authResult = await requireApiAuth();
  if (!authResult.ok) return authResult.response;

  const supabaseAdmin = getSupabaseAdmin();
  const userId = authResult.session.user.id;
  const username = authResult.session.user.username ?? "admin";
  const profileId = await resolveProfileId(userId, username);

  const { data: bucket } = await supabaseAdmin.storage.getBucket(avatarBucket);

  if (!bucket) {
    return NextResponse.json({ removedCount: 0 });
  }

  const { data: profileData } = await supabaseAdmin
    .from("admin_profiles")
    .select("avatar_url")
    .eq("id", profileId)
    .single();

  const currentAvatarUrl = ((profileData as { avatar_url?: string | null } | null)?.avatar_url ?? null) as string | null;
  const keepPath = extractStoragePath(currentAvatarUrl);

  const { data: files, error: listError } = await supabaseAdmin.storage.from(avatarBucket).list(profileId, {
    limit: 1000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });

  if (listError) {
    return NextResponse.json({ message: listError.message }, { status: 400 });
  }

  const stalePaths = (files ?? [])
    .map((file) => `${profileId}/${file.name}`)
    .filter((path) => path !== keepPath);

  if (stalePaths.length === 0) {
    return NextResponse.json({ removedCount: 0 });
  }

  const { error: removeError } = await supabaseAdmin.storage.from(avatarBucket).remove(stalePaths);

  if (removeError) {
    return NextResponse.json({ message: removeError.message }, { status: 400 });
  }

  return NextResponse.json({ removedCount: stalePaths.length });
}
