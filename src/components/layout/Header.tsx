"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import { ChevronDown, KeyRound, LogOut, Menu, UserCircle } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type HeaderProps = {
  onOpenSidebar: () => void;
  userName: string;
};

export function Header({ onOpenSidebar, userName }: HeaderProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const displayName = session?.user?.name ?? session?.user?.username ?? userName;
  const profileImage = session?.user?.image;
  const initials = (displayName || "Admin")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("") || "AD";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await signOut({
      callbackUrl: "/auth/login",
      redirect: true,
    });
  };

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border bg-background/90 px-3 py-2 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Buka sidebar"
        >
          <Menu className="size-4" />
        </button>
        <div>
          <h1  className="text-lg font-semibold tracking-wide">AR Store</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setOpen((value) => !value)}
          className="inline-flex max-w-[62vw] items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 pr-2 shadow-sm transition hover:bg-muted sm:max-w-none sm:pr-3"
        >
          {profileImage ? (
            <Image
              src={profileImage}
              alt="Foto Profil"
              width={32}
              height={32}
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {initials}
            </span>
          )}
          <span className="max-w-26 truncate text-sm font-medium text-foreground sm:max-w-none">{displayName}</span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </button>

        <div
          className={cn(
            "absolute right-0 mt-2 w-52 rounded-xl border border-border bg-popover p-1.5 shadow-xl transition",
            open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
          )}
        >
          <div className="mb-1 flex items-center justify-between rounded-lg px-3 py-2">
            <span className="text-foreground text-sm">Tema</span>
            <ThemeToggle />
          </div>

          <button
            onClick={() => {
              setOpen(false);
              router.push("/profil");
            }}
            className="text-foreground hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm"
          >
            <UserCircle className="size-4" />
            Profil
          </button>

          <button
            onClick={() => {
              setOpen(false);
              router.push("/profil?mode=ganti-password");
            }}
            className="text-foreground hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm"
          >
            <KeyRound className="size-4" />
            Ganti Password
          </button>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </div>
      </div>
      </div>
    </header>
  );
}
