"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import {
  Activity,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  PackageMinus,
  PackagePlus,
  User,
  X,
} from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type SidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

const menuItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/stock", label: "Stock Barang", icon: Package },
  { href: "/barang-masuk", label: "Barang Masuk", icon: PackagePlus },
  { href: "/barang-keluar", label: "Barang Keluar", icon: PackageMinus },
  { href: "/laporan", label: "Laporan", icon: FileText },
];

const groupedMenuItems = [
  {
    title: "Utama",
    items: menuItems.slice(0, 2),
  },
  {
    title: "Manajemen Inventory",
    items: menuItems.slice(2),
  },
];

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const fullName = session?.user?.name ?? "Admin AR Store";
  const username = session?.user?.username ?? "admin";
  const profileImage = session?.user?.image;

  const handleLogout = async () => {
    await signOut({
      callbackUrl: "/auth/login",
      redirect: true,
    });
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-zinc-950/45 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-card transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:self-start lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="relative flex items-center justify-center px-4 py-4">
          <div className="flex items-center gap-2.5">
            <Image
              src="/assets/ar-logo.webp"
              alt="Logo AR Store"
              width={100}
              height={100}
              className="object-cover content-center"
              priority
            />
          </div>
          <button
            className="text-muted-foreground hover:bg-muted absolute right-4 top-1/3 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md lg:hidden"
            onClick={onClose}
            aria-label="Tutup sidebar"
          >
            <X className="size-6" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {groupedMenuItems.map((group) => {
            return (
              <div key={group.title} className="space-y-1.5">
                <p className="text-muted-foreground px-3 text-[11px] font-semibold tracking-[0.14em] uppercase">
                  {group.title}
                </p>

                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                        active
                          ? "bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(1,141,138,0.28)]"
                          : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      )}
                    >
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="bg-background rounded-xl border border-border p-3 shadow-sm">
            <Link
              href="/profil"
              onClick={onClose}
              className="mb-3 flex items-center gap-3 rounded-lg p-1 transition hover:bg-muted"
            >
              {profileImage ? (
                <Image
                  src={profileImage}
                  alt="Foto Profil"
                  width={44}
                  height={44}
                  className="size-11 rounded-full object-cover ring-2 ring-primary/20"
                />
              ) : (
                <span className="bg-primary/15 text-primary inline-flex size-11 items-center justify-center rounded-full ring-2 ring-primary/20">
                  <User className="size-5" />
                </span>
              )}

              <div className="min-w-0">
                <p className="text-foreground truncate text-sm font-semibold">{fullName}</p>
                <p className="text-muted-foreground truncate text-xs">@{username}</p>
              </div>
            </Link>

            <button
              onClick={() => setLogoutConfirmOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              <LogOut className="size-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={logoutConfirmOpen}
        onOpenChange={setLogoutConfirmOpen}
        title="Konfirmasi Logout"
        description="Anda yakin ingin keluar dari aplikasi?"
        confirmText="Ya, Logout"
        destructive
        onConfirm={handleLogout}
      />
    </>
  );
}
