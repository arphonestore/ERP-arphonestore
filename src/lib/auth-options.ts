import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { NextAuthOptions } from "next-auth";
import { decode } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { headers } from "next/headers";
import { z } from "zod";

import { normalizeAdminFullName } from "@/lib/admin-profile";
import {
  AuthConfigurationError,
  authSecret,
  getRequiredEnv,
} from "@/lib/auth-secret";
import { hashPasswordAsync, verifyPassword } from "@/lib/password";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const PROFILE_COLUMNS = "id, username, full_name, password_hash, avatar_url";
const PROFILE_COLUMNS_WITH_SESSION_VERSION = `${PROFILE_COLUMNS}, session_version`;

const credentialSchema = z.object({
  username: z.string().trim().min(3).max(128),
  password: z.string().min(6).max(1_024),
});

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type DatabaseError = {
  code?: string;
  message?: string;
};

type DatabaseResult = {
  data: unknown;
  error: DatabaseError | null;
};

type AdminProfile = {
  id: string;
  username: string;
  fullName: string | null;
  passwordHash: string | null;
  avatarUrl: string | null;
  sessionVersion: number;
  supportsSessionVersion: boolean;
};

type ProfileLookup =
  | { status: "ok"; profile: AdminProfile }
  | { status: "missing" }
  | { status: "error" };

type RpcClient = {
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<DatabaseResult>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function parseProfile(data: unknown, supportsSessionVersion: boolean): AdminProfile | null {
  if (!isRecord(data)) {
    return null;
  }

  const sessionVersion = supportsSessionVersion ? data.session_version : 0;

  if (
    typeof data.id !== "string" ||
    data.id.length === 0 ||
    typeof data.username !== "string" ||
    data.username.length === 0 ||
    !isNullableString(data.full_name) ||
    !isNullableString(data.password_hash) ||
    !isNullableString(data.avatar_url) ||
    !Number.isSafeInteger(sessionVersion) ||
    (sessionVersion as number) < 0
  ) {
    return null;
  }

  return {
    id: data.id,
    username: data.username,
    fullName: data.full_name,
    passwordHash: data.password_hash,
    avatarUrl: data.avatar_url,
    sessionVersion: sessionVersion as number,
    supportsSessionVersion,
  };
}

function isMissingSessionVersionError(error: DatabaseError) {
  const message = error.message ?? "";

  return (
    error.code === "42703" ||
    (error.code === "PGRST204" && message.includes("session_version")) ||
    (/session_version/i.test(message) && /column|schema cache|does not exist|could not find/i.test(message))
  );
}

async function findProfile(
  supabaseAdmin: SupabaseAdmin,
  column: "id" | "username",
  value: string
): Promise<ProfileLookup> {
  const withVersion = (await supabaseAdmin
    .from("admin_profiles")
    .select(PROFILE_COLUMNS_WITH_SESSION_VERSION)
    .eq(column, value)
    .maybeSingle()) as unknown as DatabaseResult;

  if (!withVersion.error) {
    if (withVersion.data === null) {
      return { status: "missing" };
    }

    const profile = parseProfile(withVersion.data, true);
    return profile ? { status: "ok", profile } : { status: "error" };
  }

  if (!isMissingSessionVersionError(withVersion.error)) {
    return { status: "error" };
  }

  const withoutVersion = (await supabaseAdmin
    .from("admin_profiles")
    .select(PROFILE_COLUMNS)
    .eq(column, value)
    .maybeSingle()) as unknown as DatabaseResult;

  if (withoutVersion.error) {
    return { status: "error" };
  }

  if (withoutVersion.data === null) {
    return { status: "missing" };
  }

  const profile = parseProfile(withoutVersion.data, false);
  return profile ? { status: "ok", profile } : { status: "error" };
}

function parseRateLimitDecision(data: unknown): boolean | null {
  if (typeof data === "boolean") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.length === 1 ? parseRateLimitDecision(data[0]) : null;
  }

  if (!isRecord(data)) {
    return null;
  }

  for (const key of ["allowed", "is_allowed", "can_attempt"]) {
    if (typeof data[key] === "boolean") {
      return data[key] as boolean;
    }
  }

  if (typeof data.blocked === "boolean") {
    return !data.blocked;
  }

  return null;
}

type LoginRateLimitKeys = {
  identifier: string;
  client: string;
};

async function checkLoginRateLimit(
  supabaseAdmin: SupabaseAdmin,
  keys: LoginRateLimitKeys
) {
  const result = await (supabaseAdmin as unknown as RpcClient).rpc(
    "check_login_rate_limit",
    {
      p_identifier: keys.identifier,
      p_client_ip: keys.client,
    }
  );

  if (result.error) {
    return false;
  }

  return parseRateLimitDecision(result.data) === true;
}

async function runLoginAttemptMutation(
  supabaseAdmin: SupabaseAdmin,
  functionName: "record_login_failure" | "clear_login_rate_limit",
  keys: LoginRateLimitKeys
) {
  const result = await (supabaseAdmin as unknown as RpcClient).rpc(functionName, {
    p_identifier: keys.identifier,
    p_client_ip: keys.client,
  });

  return result.error === null;
}

async function rejectCredentials(
  supabaseAdmin: SupabaseAdmin,
  keys: LoginRateLimitKeys
) {
  await runLoginAttemptMutation(supabaseAdmin, "record_login_failure", keys);
  return null;
}

function normalizedLoginKey(username: string) {
  return username.normalize("NFKC").trim().toLowerCase();
}

async function getRequestIp() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",", 1)[0];
  const candidate =
    requestHeaders.get("cf-connecting-ip") ??
    requestHeaders.get("x-vercel-forwarded-for")?.split(",", 1)[0] ??
    requestHeaders.get("x-real-ip") ??
    forwardedFor ??
    "unknown";

  const normalized = candidate.trim().toLowerCase();
  return normalized.length > 0 ? normalized.slice(0, 128) : "unknown";
}

function createLoginRateLimitKeys(
  username: string,
  ipAddress: string
): LoginRateLimitKeys {
  const digest = (context: string, value: string) =>
    createHmac("sha256", authSecret)
      .update(context)
      .update("\0")
      .update(value)
      .digest("hex");

  return {
    identifier: digest("login-identifier-v1", normalizedLoginKey(username)),
    client: digest("login-client-v1", ipAddress),
  };
}

function secureTextEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function reportAuthConfigurationError(message: string) {
  console.error(`[auth] ${message}`);
}

async function persistBootstrapHash(
  supabaseAdmin: SupabaseAdmin,
  profile: AdminProfile,
  passwordHash: string
) {
  if (profile.supportsSessionVersion) {
    const nextSessionVersion = profile.sessionVersion + 1;
    if (!Number.isSafeInteger(nextSessionVersion)) {
      return null;
    }

    const result = (await supabaseAdmin
      .from("admin_profiles")
      .update({
        password_hash: passwordHash,
        session_version: nextSessionVersion,
      } as never)
      .eq("id", profile.id)
      .is("password_hash", null)
      .eq("session_version", profile.sessionVersion)
      .select(PROFILE_COLUMNS_WITH_SESSION_VERSION)
      .maybeSingle()) as unknown as DatabaseResult;

    if (result.error || result.data === null) {
      return null;
    }

    const updatedProfile = parseProfile(result.data, true);
    return updatedProfile?.passwordHash === passwordHash &&
      updatedProfile.sessionVersion === nextSessionVersion
      ? updatedProfile
      : null;
  }

  const result = (await supabaseAdmin
    .from("admin_profiles")
    .update({ password_hash: passwordHash } as never)
    .eq("id", profile.id)
    .is("password_hash", null)
    .select(PROFILE_COLUMNS)
    .maybeSingle()) as unknown as DatabaseResult;

  if (result.error || result.data === null) {
    return null;
  }

  const updatedProfile = parseProfile(result.data, false);
  return updatedProfile?.passwordHash === passwordHash ? updatedProfile : null;
}

function authenticatedUser(profile: AdminProfile) {
  return {
    id: profile.id,
    name: normalizeAdminFullName(profile.fullName) ?? profile.username,
    email: "admin@arstore.local",
    username: profile.username,
    image: profile.avatarUrl,
    sessionVersion: profile.sessionVersion,
  };
}

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
    async decode(params) {
      try {
        return await decode(params);
      } catch {
        return null;
      }
    },
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        if (
          typeof user.id !== "string" ||
          user.id.length === 0 ||
          !Number.isSafeInteger(user.sessionVersion) ||
          (user.sessionVersion as number) < 0
        ) {
          throw new Error("Unable to establish authenticated session.");
        }

        token.id = user.id;
        token.username = user.username;
        token.name = user.name;
        token.picture = user.image;
        token.sessionVersion = user.sessionVersion;
      }

      if (trigger === "update") {
        if (
          typeof token.id !== "string" ||
          token.id.length === 0 ||
          !Number.isSafeInteger(token.sessionVersion) ||
          (token.sessionVersion as number) < 0
        ) {
          throw new Error("Unable to refresh authenticated session.");
        }

        let lookup: ProfileLookup;

        try {
          lookup = await findProfile(getSupabaseAdmin(), "id", token.id);
        } catch {
          throw new Error("Unable to refresh authenticated session.");
        }

        if (
          lookup.status !== "ok" ||
          !lookup.profile.passwordHash ||
          lookup.profile.sessionVersion !== token.sessionVersion
        ) {
          throw new Error("Unable to refresh authenticated session.");
        }

        token.username = lookup.profile.username;
        token.name = normalizeAdminFullName(lookup.profile.fullName) ?? lookup.profile.username;
        token.picture = lookup.profile.avatarUrl;
        token.sessionVersion = lookup.profile.sessionVersion;
      }

      return token;
    },
    async session({ session, token }) {
      if (
        session.user &&
        typeof token.id === "string" &&
        token.id.length > 0 &&
        Number.isSafeInteger(token.sessionVersion) &&
        (token.sessionVersion as number) >= 0
      ) {
        session.user.id = token.id;
        session.user.username = typeof token.username === "string" ? token.username : undefined;
        session.user.sessionVersion = token.sessionVersion as number;

        const normalizedName = normalizeAdminFullName(token.name);
        if (normalizedName) {
          session.user.name = normalizedName;
        }

        if (typeof token.picture === "string" || token.picture === null) {
          session.user.image = token.picture;
        }
      }

      return session;
    },
  },
  providers: [
    CredentialsProvider({
      name: "Login Admin",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        let supabaseAdmin: SupabaseAdmin;

        try {
          supabaseAdmin = getSupabaseAdmin();
        } catch {
          reportAuthConfigurationError(
            "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured correctly."
          );
          return null;
        }

        try {
          const ipAddress = await getRequestIp();
          const rateLimitKeys = createLoginRateLimitKeys(parsed.data.username, ipAddress);

          if (!(await checkLoginRateLimit(supabaseAdmin, rateLimitKeys))) {
            return null;
          }

          const lookup = await findProfile(
            supabaseAdmin,
            "username",
            parsed.data.username
          );

          if (lookup.status !== "ok") {
            if (lookup.status === "missing") {
              return await rejectCredentials(supabaseAdmin, rateLimitKeys);
            }

            return null;
          }

          let profile = lookup.profile;

          if (profile.passwordHash !== null) {
            if (!(await verifyPassword(parsed.data.password, profile.passwordHash))) {
              return await rejectCredentials(supabaseAdmin, rateLimitKeys);
            }
          } else {
            const bootstrapUsername = getRequiredEnv("ADMIN_USERNAME", { minLength: 3 });
            const bootstrapPassword = getRequiredEnv("ADMIN_PASSWORD", {
              minLength: 12,
              trim: false,
            });

            if (
              !secureTextEqual(parsed.data.username, bootstrapUsername) ||
              !secureTextEqual(parsed.data.password, bootstrapPassword)
            ) {
              return await rejectCredentials(supabaseAdmin, rateLimitKeys);
            }

            const passwordHash = await hashPasswordAsync(parsed.data.password);
            const bootstrappedProfile = await persistBootstrapHash(
              supabaseAdmin,
              profile,
              passwordHash
            );

            if (!bootstrappedProfile) {
              return null;
            }

            profile = bootstrappedProfile;
          }

          if (!(await runLoginAttemptMutation(
            supabaseAdmin,
            "clear_login_rate_limit",
            rateLimitKeys
          ))) {
            return null;
          }

          return authenticatedUser(profile);
        } catch (error) {
          if (error instanceof AuthConfigurationError) {
            reportAuthConfigurationError(error.message);
          }

          return null;
        }
      },
    }),
  ],
};
