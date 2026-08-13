import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth-options";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type DatabaseError = {
  code?: string;
  message?: string;
};

type QueryResult = {
  data: unknown;
  error: DatabaseError | null;
};

type SessionVersionLookup =
  | { ok: true; found: false }
  | { ok: true; found: true; sessionVersion: number }
  | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingSessionVersionError(error: DatabaseError) {
  const message = error.message ?? "";

  return (
    error.code === "42703" ||
    (error.code === "PGRST204" && message.includes("session_version")) ||
    (/session_version/i.test(message) && /column|schema cache|does not exist|could not find/i.test(message))
  );
}

function parseVersionedProfile(data: unknown, expectedId: string) {
  if (!isRecord(data) || data.id !== expectedId) {
    return null;
  }

  const sessionVersion = data.session_version;
  if (!Number.isSafeInteger(sessionVersion) || (sessionVersion as number) < 0) {
    return null;
  }

  return sessionVersion as number;
}

function parseLegacyProfile(data: unknown, expectedId: string) {
  return isRecord(data) && data.id === expectedId;
}

async function getCurrentSessionVersion(profileId: string): Promise<SessionVersionLookup> {
  const supabaseAdmin = getSupabaseAdmin();
  const withVersion = (await supabaseAdmin
    .from("admin_profiles")
    .select("id, session_version")
    .eq("id", profileId)
    .maybeSingle()) as unknown as QueryResult;

  if (!withVersion.error) {
    if (withVersion.data === null) {
      return { ok: true, found: false };
    }

    const sessionVersion = parseVersionedProfile(withVersion.data, profileId);
    return sessionVersion === null
      ? { ok: false }
      : { ok: true, found: true, sessionVersion };
  }

  if (!isMissingSessionVersionError(withVersion.error)) {
    return { ok: false };
  }

  const withoutVersion = (await supabaseAdmin
    .from("admin_profiles")
    .select("id")
    .eq("id", profileId)
    .maybeSingle()) as unknown as QueryResult;

  if (withoutVersion.error) {
    return { ok: false };
  }

  if (withoutVersion.data === null) {
    return { ok: true, found: false };
  }

  return parseLegacyProfile(withoutVersion.data, profileId)
    ? { ok: true, found: true, sessionVersion: 0 }
    : { ok: false };
}

function unauthorizedResponse() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

function unavailableResponse() {
  return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
}

export async function requireApiAuth() {
  let session;

  try {
    session = await getServerSession(authOptions);
  } catch {
    return {
      ok: false as const,
      response: unavailableResponse(),
    };
  }

  if (!session?.user) {
    return {
      ok: false as const,
      response: unauthorizedResponse(),
    };
  }

  const authenticatedSession = session;
  const profileId = authenticatedSession.user.id;
  const claimedVersion = authenticatedSession.user.sessionVersion;

  if (
    typeof profileId !== "string" ||
    profileId.length === 0 ||
    !Number.isSafeInteger(claimedVersion) ||
    (claimedVersion as number) < 0
  ) {
    return {
      ok: false as const,
      response: unauthorizedResponse(),
    };
  }

  let lookup: SessionVersionLookup;

  try {
    lookup = await getCurrentSessionVersion(profileId);
  } catch {
    return {
      ok: false as const,
      response: unavailableResponse(),
    };
  }

  if (!lookup.ok) {
    return {
      ok: false as const,
      response: unavailableResponse(),
    };
  }

  if (!lookup.found || lookup.sessionVersion !== claimedVersion) {
    return {
      ok: false as const,
      response: unauthorizedResponse(),
    };
  }

  return {
    ok: true as const,
    session: authenticatedSession,
  };
}
