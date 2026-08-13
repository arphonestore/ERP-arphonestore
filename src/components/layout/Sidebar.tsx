
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
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
import { useEffect, useRef, useState } from "react";

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
  { title: "Utama", items: menuItems.slice(0, 2) },
  { title: "Manajemen Inventory", items: menuItems.slice(2) },
];

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const fullName = session?.user?.name ?? "Admin AR Store";
  const username = session?.user?.username ?? "admin";
  const profileImage = session?.user?.image;
  const mobileModalOpen = mobileOpen && !isDesktop;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateViewport = () => setIsDesktop(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!mobileModalOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !asideRef.current) return;

      const focusable = Array.from(asideRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [mobileModalOpen, onClose]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/auth/login", redirect: true });
  };

  return (
    <>
      <button
        type="button"
        aria-label="Tutup sidebar"
        tabIndex={mobileModalOpen ? 0 : -1}
        className={cn(
          "fixed inset-0 z-30 bg-zinc-950/45 transition-opacity lg:hidden",
          mobileModalOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      <aside
        ref={asideRef}
        id="mobile-navigation"
        role={!isDesktop ? "dialog" : undefined}
        aria-modal={mobileModalOpen ? true : undefined}
        aria-label="Navigasi utama"
        aria-hidden={!isDesktop && !mobileOpen ? true : undefined}
        inert={!isDesktop && !mobileOpen ? true : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-card transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:self-start lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="relative flex items-center justify-center px-4 py-4">
          <Image
            src="/assets/logo-fix.svg"
            alt="Logo AR Store"
            width={100}
            height={100}
            className="object-contain"
            priority
          />
          <button
            ref={closeButtonRef}
            type="button"
            className="absolute right-4 top-1/3 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            onClick={onClose}
            aria-label="Tutup sidebar"
          >
            <X className="size-6" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {groupedMenuItems.map((group) => (
            <div key={group.title} className="space-y-1.5">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.title}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
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
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="rounded-xl border border-border bg-background p-3 shadow-sm">
            <Link href="/profil" onClick={onClose} className="mb-3 flex items-center gap-3 rounded-lg p-1 transition hover:bg-muted">
              {profileImage ? (
                <Image src={profileImage} alt="Foto Profil" width={44} height={44} className="size-11 rounded-full object-cover ring-2 ring-primary/20" />
              ) : (
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary ring-2 ring-primary/20"><User className="size-5" /></span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{fullName}</p>
                <p className="truncate text-xs text-muted-foreground">@{username}</p>
              </div>
            </Link>

            <button type="button" onClick={() => setLogoutConfirmOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700">
              <LogOut className="size-4" /> Logout
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
