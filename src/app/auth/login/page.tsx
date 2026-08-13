"use client";

import { type FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { signIn } from "next-auth/react";

import FloatingLines from "@/components/FloatingLines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LOGIN_LINES_GRADIENT = ["#018D8A", "#6f6f6f", "#6a6a6a"];

function sanitizeUsername(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function sanitizePassword(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

function resolveSafeCallbackUrl() {
  if (typeof window === "undefined") return "/dashboard";

  const rawCallback = new URLSearchParams(window.location.search).get("callbackUrl");
  if (!rawCallback) return "/dashboard";

  try {
    const decoded = decodeURIComponent(rawCallback);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.startsWith("/auth/login")) {
      return "/dashboard";
    }

    return decoded;
  } catch {
    return "/dashboard";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const username = sanitizeUsername(formData.get("username"));
    const password = sanitizePassword(formData.get("password"));

    if (!username || !password) {
      setFormError("Username dan password wajib diisi dengan format valid.");
      setIsSubmitting(false);
      return;
    }

    const callbackUrl = resolveSafeCallbackUrl();

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.ok) {
        router.push(result.url ?? callbackUrl);
        router.refresh();
        return;
      }

      setFormError("Login gagal. Periksa username dan password Anda.");
    } catch {
      setFormError("Terjadi kendala koneksi saat login. Periksa jaringan lalu coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950">
      <div className="absolute inset-0" aria-hidden="true">
        <FloatingLines
          linesGradient={LOGIN_LINES_GRADIENT}
          animationSpeed={1.3}
          interactive={false}
          bendRadius={3.5}
          bendStrength={15}
          mouseDamping={0.04}
          parallax
          parallaxStrength={0.2}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-black/25 lg:bg-black/10" />

      <div className="relative z-10 grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr]">
        <section className="hidden lg:block" aria-hidden="true" />

        <section className="flex items-center justify-center px-5 py-10 md:px-8 lg:bg-background/95 lg:px-12 lg:backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/35 bg-white/80 p-5 shadow-2xl backdrop-blur-xl dark:border-white/20 dark:bg-zinc-900/85 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-0">
            <div className="mb-7 flex justify-center">
              <Image
                src="/assets/logo-fix.svg"
                alt="Logo AR Store"
                width={168}
                height={168}
                priority
                className="h-auto w-42"
              />
            </div>

            <div className="mb-7 text-center">
              <h1 className="text-4xl font-semibold tracking-tight">Login</h1>
              <p className="mt-4 text-lg leading-7 text-muted-foreground">
                Masukkan username dan password untuk mengakses dashboard.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4" aria-describedby={formError ? "login-error" : undefined}>
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  placeholder="Masukkan username Anda"
                  maxLength={64}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  aria-invalid={Boolean(formError)}
                  className="h-11 bg-white dark:bg-zinc-900"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Masukkan password Anda"
                    maxLength={128}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    aria-invalid={Boolean(formError)}
                    className="h-11 bg-white pr-11 dark:bg-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-3 inline-flex items-center rounded text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>

              {formError ? (
                <p id="login-error" role="alert" aria-live="assertive" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}

              <Button type="submit" className="mx-auto mt-2 h-12 w-40 rounded-full text-base font-medium" disabled={isSubmitting}>
                {isSubmitting ? "Memproses..." : "Masuk"}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
