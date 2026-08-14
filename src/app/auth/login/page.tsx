"use client";

import { type FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { signIn, useSession } from "next-auth/react";

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
  const { status } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;

    router.replace(resolveSafeCallbackUrl());
    router.refresh();
  }, [router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const username = sanitizeUsername(formData.get("username"));
    const password = sanitizePassword(formData.get("password"));
    const rememberMe = formData.get("rememberMe") === "true";

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
        rememberMe: rememberMe ? "true" : "false",
        redirect: false,
        callbackUrl,
      });

      if (result?.ok) {
        router.replace(callbackUrl);
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

  if (status !== "unauthenticated") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-[#080b0c] text-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <LoaderCircle className="size-7 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-white/55">
            {status === "authenticated" ? "Mengarahkan ke dashboard..." : "Memeriksa sesi..."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-[#080b0c] text-white">
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
      <div className="pointer-events-none absolute inset-0 bg-black/35" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -top-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl md:left-1/4 xl:h-136 xl:w-136"
        aria-hidden="true"
      />

      <div className="relative z-10 flex min-h-svh items-center justify-center p-4 sm:p-6 md:p-8 xl:p-0">
        <div className="grid w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#111516]/90 shadow-[0_32px_100px_rgba(0,0,0,0.65)] backdrop-blur-xl md:max-w-5xl md:grid-cols-[0.9fr_1.1fr] xl:min-h-svh xl:max-w-none xl:grid-cols-[1.08fr_0.92fr] xl:rounded-none xl:border-0 xl:bg-transparent xl:shadow-none xl:backdrop-blur-none">
          <section className="relative hidden overflow-hidden border-r border-white/10 md:flex md:flex-col md:justify-between md:p-8 lg:p-10 xl:border-r-0 xl:p-14 2xl:p-20">
            <div
              className="absolute inset-0 bg-[radial-gradient(circle_at_28%_28%,rgba(12,186,183,0.2),transparent_38%),linear-gradient(145deg,rgba(14,18,19,0.8),rgba(5,8,9,0.48))] xl:bg-[radial-gradient(circle_at_35%_38%,rgba(12,186,183,0.16),transparent_34%),linear-gradient(90deg,rgba(5,8,9,0.08),rgba(5,8,9,0.58))]"
              aria-hidden="true"
            />

            <div className="relative flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/15 text-primary">
                <Boxes className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-[0.18em] text-white">AR STORE</p>
                <p className="mt-0.5 text-xs text-white/50">Inventory Management</p>
              </div>
            </div>

            <div className="relative my-10 max-w-xl xl:my-auto">
              <Image
                src="/assets/logo-fix.svg"
                alt="Logo AR Store"
                width={184}
                height={184}
                priority
                className="mb-8 h-auto w-36 drop-shadow-[0_12px_28px_rgba(0,0,0,0.35)] lg:w-40 xl:w-44"
              />
              <h2 className="max-w-lg text-3xl leading-tight font-semibold tracking-tight lg:text-4xl xl:text-5xl xl:leading-[1.12]">
                Kelola alur stok dengan lebih terarah.
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-6 text-white/55 lg:text-base lg:leading-7">
                Pantau persediaan, transaksi barang, dan aktivitas operasional dalam satu dashboard.
              </p>
            </div>
          </section>

          <section className="relative flex items-center justify-center px-5 py-7 sm:px-8 sm:py-9 md:bg-[#101314]/92 md:px-10 md:py-12 lg:px-14 xl:bg-[#0e1112]/95 xl:px-16 2xl:px-24">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent md:hidden"
              aria-hidden="true"
            />

            <div className="w-full max-w-md">
              <div className="mb-6 flex justify-center md:hidden">
                <Image
                  src="/assets/logo-fix.svg"
                  alt="Logo AR Store"
                  width={132}
                  height={132}
                  priority
                  className="h-auto w-28 drop-shadow-[0_12px_28px_rgba(0,0,0,0.4)] sm:w-32"
                />
              </div>

              <div className="mb-7 text-center md:text-left">
                <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                  Selamat datang
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Masuk ke dashboard
                </h1>
                <p className="mt-3 text-sm leading-6 text-white/50 sm:text-base">
                  Gunakan akun yang telah terdaftar untuk melanjutkan.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="grid gap-5"
                aria-describedby={formError ? "login-error" : undefined}
              >
                <div className="grid gap-2.5">
                  <Label htmlFor="username" className="text-sm text-white/80">
                    Username
                  </Label>
                  <div className="relative">
                    <UserRound
                      className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-white/30"
                      aria-hidden="true"
                    />
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
                      className="h-13 rounded-xl border-white/10 bg-white/5 pr-4 pl-12 text-base text-white shadow-none placeholder:text-white/30 hover:border-white/20 focus-visible:border-primary/70 focus-visible:ring-primary/20 focus-visible:ring-offset-0"
                    />
                  </div>
                </div>

                <div className="grid gap-2.5">
                  <Label htmlFor="password" className="text-sm text-white/80">
                    Password
                  </Label>
                  <div className="relative">
                    <LockKeyhole
                      className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-white/30"
                      aria-hidden="true"
                    />
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
                      className="h-13 rounded-xl border-white/10 bg-white/5 pr-12 pl-12 text-base text-white shadow-none placeholder:text-white/30 hover:border-white/20 focus-visible:border-primary/70 focus-visible:ring-primary/20 focus-visible:ring-offset-0"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute inset-y-0 right-2 inline-flex w-10 items-center justify-center rounded-lg text-white/35 outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/60"
                      aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </button>
                  </div>
                </div>

                <label
                  htmlFor="rememberMe"
                  className="flex cursor-pointer items-start gap-3 text-left"
                >
                  <input
                    id="rememberMe"
                    name="rememberMe"
                    type="checkbox"
                    value="true"
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium text-white/80">Ingat saya</span>
                    <span className="mt-1 block text-xs leading-5 text-white/40">
                      Tetap masuk selama 30 hari di perangkat ini.
                    </span>
                  </span>
                </label>

                {formError ? (
                  <p
                    id="login-error"
                    role="alert"
                    aria-live="assertive"
                    className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm leading-5 text-red-200"
                  >
                    {formError}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  className="mt-1 h-13 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-[0_12px_32px_rgba(12,186,183,0.24)] hover:bg-[#10cfca] hover:shadow-[0_16px_38px_rgba(12,186,183,0.3)]"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      Masuk ke dashboard
                      <ArrowRight className="size-5 transition-transform group-hover/button:translate-x-0.5" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-7 flex items-center justify-center gap-2 text-xs text-white/35 md:justify-start">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <span>Kredensial Anda dilindungi oleh sistem</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
