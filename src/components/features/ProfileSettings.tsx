"use client";

import Image from "next/image";
import { Camera, Eye, EyeOff, Loader2, Save, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
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
};

type FormState = {
  fullName: string;
  username: string;
  avatarUrl: string | null;
  avatarFile: File | null;
  removeAvatar: boolean;
  password: string;
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
  password: "",
  confirmPassword: "",
};

function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getInitials(fullName: string, username: string) {
  const source = fullName.trim() || username.trim() || "Admin";
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "AD";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function ProfileSettings() {
  const { update } = useSession();
  const [form, setForm] = useState<FormState>(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [avatarObjectUrl, setAvatarObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    const timerId = window.setTimeout(async () => {
      const response = await fetch("/api/profile", { cache: "no-store" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ message: "Gagal memuat profil." }))) as { message?: string };
        toast.error(payload.message ?? "Gagal memuat profil.");
        setLoading(false);
        return;
      }

      const profile = (await response.json()) as ProfilePayload;
      setForm((prev) => ({
        ...prev,
        fullName: profile.full_name ?? "",
        username: profile.username,
        avatarUrl: profile.avatar_url,
        avatarFile: null,
        removeAvatar: false,
      }));

      await update({
        name: profile.full_name ?? profile.username,
        username: profile.username,
        image: profile.avatar_url,
      });

      setLoading(false);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [update]);

  useEffect(() => {
    if (!form.avatarFile) {
      setAvatarObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(form.avatarFile);
    setAvatarObjectUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [form.avatarFile]);

  const avatarPreview = useMemo(() => avatarObjectUrl ?? form.avatarUrl ?? "/assets/ar-logo.webp", [avatarObjectUrl, form.avatarUrl]);
  const hasAvatarImage = Boolean(avatarObjectUrl || form.avatarUrl);
  const avatarInitials = useMemo(() => getInitials(form.fullName, form.username), [form.fullName, form.username]);

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

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

    try {
      setForm((prev) => ({ ...prev, avatarFile: file, removeAvatar: false }));
      toast.success("Foto profil siap disimpan.");
    } catch {
      toast.error("Gagal memproses file foto.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (form.password && form.password.length < 6) {
      toast.error("Password baru minimal 6 karakter.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error("Konfirmasi password baru tidak sama.");
      return;
    }

    setSaving(true);

    const payload = new FormData();
    payload.set("fullName", form.fullName);
    payload.set("username", form.username);
    payload.set("password", form.password);
    payload.set("removeAvatar", form.removeAvatar ? "true" : "false");

    if (form.avatarFile) {
      payload.set("avatar", form.avatarFile);
    }

    const response = await fetch("/api/profile", {
      method: "PUT",
      body: payload,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "Gagal menyimpan profil." }))) as {
        message?: string;
      };
      toast.error(payload.message ?? "Gagal menyimpan profil.");
      setSaving(false);
      return;
    }

    const updated = (await response.json()) as ProfilePayload;

    setForm((prev) => ({
      ...prev,
      fullName: updated.full_name ?? "",
      username: updated.username,
      avatarUrl: updated.avatar_url,
      avatarFile: null,
      removeAvatar: false,
      password: "",
      confirmPassword: "",
    }));

    await update({
      name: updated.full_name ?? updated.username,
      username: updated.username,
      image: updated.avatar_url,
    });

    toast.success("Profil berhasil diperbarui.");
    setSaving(false);
  }

  async function handleCleanupAvatars() {
    setCleaning(true);

    const response = await fetch("/api/profile/cleanup-avatars", {
      method: "POST",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "Gagal membersihkan avatar lama." }))) as {
        message?: string;
      };
      toast.error(payload.message ?? "Gagal membersihkan avatar lama.");
      setCleaning(false);
      return;
    }

    const payload = (await response.json()) as { removedCount: number };
    toast.success(`Pembersihan selesai. ${payload.removedCount} file lama dihapus.`);
    setCleaning(false);
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
              <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarChange} />
            </label>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading || saving || !hasAvatarImage}
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  avatarFile: null,
                  avatarUrl: null,
                  removeAvatar: true,
                }));
              }}
            >
              <Trash2 className="size-4" />
              Hapus Foto
            </Button>

            <Button type="button" variant="ghost" className="w-full" disabled={loading || saving || cleaning} onClick={handleCleanupAvatars}>
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
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                placeholder="Masukkan nama lengkap"
                disabled={loading || saving}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                placeholder="Masukkan username"
                disabled={loading || saving}
                required
              />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="password">Password Baru</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Kosongkan jika tidak ganti"
                    disabled={loading || saving}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={loading || saving}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
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
                    onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    placeholder="Ulangi password baru"
                    disabled={loading || saving}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    disabled={loading || saving}
                    aria-label={showConfirmPassword ? "Sembunyikan konfirmasi password" : "Tampilkan konfirmasi password"}
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </div>

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
