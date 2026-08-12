import type { NextAuthOptions } from "next-auth";
import { decode } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import { authSecret } from "@/lib/auth-secret";
import { normalizeAdminFullName } from "@/lib/admin-profile";
import { verifyPassword } from "@/lib/password";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const credentialSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
  },
  jwt: {
    async decode(params) {
      try {
        return await decode(params);
      } catch {
        return null;
      }
    },
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.name = user.name;
        token.picture = user.image;
      }

      if (trigger === "update") {
        if (session?.username) {
          token.username = session.username as string;
        }

        if (session?.name) {
          token.name = session.name;
        }

        if (Object.prototype.hasOwnProperty.call(session ?? {}, "image")) {
          token.picture = (session as { image?: string | null }).image ?? null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
        session.user.username = token.username;

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

        const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
        const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

        try {
          const supabaseAdmin = getSupabaseAdmin();
          const { data } = await supabaseAdmin
            .from("admin_profiles")
            .select("id, username, full_name, password_hash, avatar_url")
            .eq("username", parsed.data.username)
            .single();

          const profile = (data ?? null) as {
            id: string;
            username: string;
            full_name: string | null;
            password_hash: string | null;
            avatar_url: string | null;
          } | null;

          if (profile?.password_hash && verifyPassword(parsed.data.password, profile.password_hash)) {
            return {
              id: profile.id,
              name: normalizeAdminFullName(profile.full_name) ?? profile.username,
              email: "admin@arstore.local",
              username: profile.username,
              image: profile.avatar_url,
            };
          }

          if (!profile?.password_hash && parsed.data.username === adminUsername && parsed.data.password === adminPassword) {
            return {
              id: profile?.id ?? "admin-local",
              name: normalizeAdminFullName(profile?.full_name) ?? "Admin AR Store",
              email: "admin@arstore.local",
              username: profile?.username ?? adminUsername,
              image: profile?.avatar_url ?? null,
            };
          }
        } catch {
          if (parsed.data.username === adminUsername && parsed.data.password === adminPassword) {
            return {
              id: "admin-local",
              name: "Admin AR Store",
              email: "admin@arstore.local",
              username: adminUsername,
              image: null,
            };
          }
        }

        return null;
      },
    }),
  ],
};
