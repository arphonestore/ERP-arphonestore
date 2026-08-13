"use client";

import Image from "next/image";
import { Camera, Eye, EyeOff, Loader2, Save, Trash2 } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProfilePayload = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  updated_at: string;
  sessionInvalidated?: boolean;
  avatarCleanupPending?: boolean;
};

type FormState = {
  fullName: string;
  username: string;
  avatarUrl: string | null;
  avatarFile: File | null;
  removeAvatar: boolean;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const allowedMimeTypes = ["image/png", "image/jpeg", "image/webp"];
const maxAvatarBytes = 2 * 1024 * 1024;

const initialForm: FormState = {
  fullName: "",
  username: "",
  avatarUrl: null,
  avatarFile: null,
  removeAvatar: false,
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getInitials(fullName: string, username: string) {
  const source = fullName.trim() || username.trim() || "Admin";
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "AD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

async function readApiMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: unknown };
    return typeof payload.message === "string" && payload.message ? payload.message : fallback;
  } catch {
    return fallback;
  }
}

export function ProfileSettings() {
  const router = useRouter();
  const { update } = useSession();
  const [form, setForm] = useState<FormState>(initialForm);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [avatarObjectUrl, setAvatarObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadProfile() {
      try {
        const response = await fetch("/api/profile", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          toast.error(await readApiMessage(response, "Gagal memuat profil."));
          return;
        }

        const profile = (await response.json()) as ProfilePayload;
        if (!active) return;

        setForm((previous) => ({
          ...previous,
          fullName: profile.full_name ?? "",
          username: profile.username,
          avatarUrl: profile.avatar_url,
          avatarFile: null,
          removeAvatar: false,
        }));

        try {
          await update();
        } catch {
          toast.warning("Profil dimuat, tetapi sesi belum dapat disegarkan.");
        }
      } catch {
        if (!controller.signal.aborted) {
          toast.error("Koneksi bermasalah. Profil belum dapat dimuat.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      active = false;
      controller.abort();
    };
  }, [update]);

  useEffect(() => {
    if (!form.avatarFile) {
      setAvatarObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(form.avatarFile);
    setAvatarObjectUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [form.avatarFile]);

  const avatarPreview = useMemo(
    () => avatarObjectUrl ?? form.avatarUrl ?? "/assets/logo-fix.svg",
    [avatarObjectUrl, form.avatarUrl]
  );
  const hasAvatarImage = Boolean(avatarObjectUrl || form.avatarUrl);
  const avatarInitials = useMemo(
    () => getInitials(form.fullName, form.username),
    [form.fullName, form.username]
  );

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!allowedMimeTypes.includes(file.type)) {
      toast.error("Format foto harus PNG, JPG/JPEG, atau WEBP.");
      event.target.value = "";
      return;
    }

    if (file.size > maxAvatarBytes) {
      toast.error(`Ukuran foto maksimal ${formatBytes(maxAvatarBytes)}.`);
      event.target.value = "";
      return;
    }

    setForm((previous) => ({ ...previous, avatarFile: file, removeAvatar: false }));
    toast.success("Foto profil siap disimpan.");
    event.target.value = "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const changingPassword = Boolean(
      form.currentPassword || form.newPassword || form.confirmPassword
    );

    if (changingPassword) {
      if (!form.currentPassword) {
        toast.error("Password saat ini wajib diisi.");
        return;
      }

      if (form.newPassword.length < 12) {
        toast.error("Password baru minimal 12 karakter.");
        return;
      }

      if (form.newPassword.length > 128) {
        toast.error("Password baru maksimal 128 karakter.");
        return;
      }

      if (form.newPassword !== form.confirmPassword) {
        toast.error("Konfirmasi password baru tidak sama.");
        return;
      }

      if (form.newPassword === form.currentPassword) {
        toast.error("Password baru harus berbeda dari password saat ini.");
        return;
      }
    }

    setSaving(true);

    try {
      const requestPayload = new FormData();
      requestPayload.set("fullName", form.fullName);
      requestPayload.set("username", form.username);
      requestPayload.set("currentPassword", changingPassword ? form.currentPassword : "");
      requestPayload.set("newPassword", changingPassword ? form.newPassword : "");
      requestPayload.set("removeAvatar", form.removeAvatar ? "true" : "false");

      if (form.avatarFile) {
        requestPayload.set("avatar", form.avatarFile);
      }

      const response = await fetch("/api/profile", {
        method: "PUT",
        body: requestPayload,
      });

      if (!response.ok) {
        toast.error(await readApiMessage(response, "Gagal menyimpan profil."));
        return;
      }

      const updated = (await response.json()) as ProfilePayload;
      setForm((previous) => ({
        ...previous,
        fullName: updated.full_name ?? "",
        username: updated.username,
        avatarUrl: updated.avatar_url,
        avatarFile: null,
        removeAvatar: false,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));

      if (updated.sessionInvalidated) {
        toast.success("Profil dan password berhasil diperbarui. Silakan login kembali.");
        await signOut({ callbackUrl: "/auth/login", redirect: false }).catch(() => undefined);
        router.replace("/auth/login");
        router.refresh();
        return;
      }

      try {
        // The auth callback re-fetches trusted profile fields using the immutable session ID.
        await update();
      } catch {
        toast.warning("Profil tersimpan, tetapi sesi belum dapat disegarkan.");
      }

      toast.success("Profil berhasil diperbarui.");
      if (updated.avatarCleanupPending) {
        toast.warning("Profil tersimpan, tetapi foto lama masih menunggu pembersihan.");
      }
    } catch {
      toast.error("Koneksi bermasalah. Perubahan profil belum dapat dipastikan tersimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCleanupAvatars() {
    if (cleaning) return;
    setCleaning(true);

    try {
      const response = await fetch("/api/profile/cleanup-avatars", { method: "POST" });

      if (!response.ok) {
        toast.error(await readApiMessage(response, "Gagal membersihkan avatar lama."));
        return;
      }

      const payload = (await response.json()) as { removedCount: number };
      toast.success(`Pembersihan selesai. ${payload.removedCount} file lama dihapus.`);
    } catch {
      toast.error("Koneksi bermasalah. Foto lama belum dapat dibersihkan.");
    } finally {
      setCleaning(false);
    }
  }

  return (
    <section className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Profil Admin</h1>
        <p className="text-muted-foreground text-sm">Kelola foto, nama lengkap, username, dan password akun admin.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pengaturan Profil</CardTitle>
          <CardDescription>Perubahan akan disimpan ke backend dan database secara sinkron.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="space-y-3">
            <div className="relative mx-auto size-44 overflow-hidden rounded-full border border-border bg-muted">
              {hasAvatarImage ? (
                <Image src={avatarPreview} alt="Foto Profil" fill className="object-cover" sizes="176px" />
              ) : (
                <div className="flex size-full items-center justify-center bg-linear-to-br from-emerald-600 to-teal-700 text-4xl font-semibold text-white">
                  {avatarInitials}
                </div>
              )}
            </div>

            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
              <Camera className="size-4" />
              Upload Foto
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={loading || saving}
                onChange={handleAvatarChange}
              />
            </label>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading || saving || !hasAvatarImage}
              onClick={() => {
                setForm((previous) => ({
                  ...previous,
                  avatarFile: null,
                  avatarUrl: null,
                  removeAvatar: true,
                }));
              }}
            >
              <Trash2 className="size-4" />
              Hapus Foto
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={loading || saving || cleaning}
              onClick={handleCleanupAvatars}
            >
              {cleaning ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {cleaning ? "Membersihkan..." : "Bersihkan Foto Lama"}
            </Button>
            <p className="text-xs text-muted-foreground">Format: PNG/JPG/WEBP, maksimal 2MB.</p>
          </div>

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="fullName">Nama Lengkap</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(event) => setForm((previous) => ({ ...previous, fullName: event.target.value }))}
                placeholder="Masukkan nama lengkap"
                maxLength={200}
                disabled={loading || saving}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(event) => setForm((previous) => ({ ...previous, username: event.target.value }))}
                placeholder="Masukkan username"
                maxLength={30}
                autoComplete="username"
                disabled={loading || saving}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="currentPassword">Password Saat Ini</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  value={form.currentPassword}
                  onChange={(event) => setForm((previous) => ({ ...previous, currentPassword: event.target.value }))}
                  placeholder="Wajib jika mengganti password"
                  autoComplete="current-password"
                  maxLength={1024}
                  disabled={loading || saving}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
                  onClick={() => setShowCurrentPassword((previous) => !previous)}
                  disabled={loading || saving}
                  aria-label={showCurrentPassword ? "Sembunyikan password saat ini" : "Tampilkan password saat ini"}
                >
                  {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="newPassword">Password Baru</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={form.newPassword}
                    onChange={(event) => setForm((previous) => ({ ...previous, newPassword: event.target.value }))}
                    placeholder="Kosongkan jika tidak ganti"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    disabled={loading || saving}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
                    onClick={() => setShowNewPassword((previous) => !previous)}
                    disabled={loading || saving}
                    aria-label={showNewPassword ? "Sembunyikan password baru" : "Tampilkan password baru"}
                  >
                    {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Konfirmasi Password Baru</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(event) => setForm((previous) => ({ ...previous, confirmPassword: event.target.value }))}
                    placeholder="Ulangi password baru"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    disabled={loading || saving}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
                    onClick={() => setShowConfirmPassword((previous) => !previous)}
                    disabled={loading || saving}
                    aria-label={showConfirmPassword ? "Sembunyikan konfirmasi password" : "Tampilkan konfirmasi password"}
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Password baru minimal 12 karakter dan harus berbeda dari password saat ini.</p>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={loading || saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
