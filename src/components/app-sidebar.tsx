"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ClipboardList, LayoutDashboard, PackageSearch, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

const menuItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Stock Barang",
    href: "/stock",
    icon: Boxes,
  },
  {
    label: "Barang Masuk",
    href: "/barang-masuk",
    icon: PackageSearch,
  },
  {
    label: "Barang Keluar",
    href: "/barang-keluar",
    icon: PackageSearch,
  },
  {
    label: "Laporan",
    href: "/laporan",
    icon: ClipboardList,
  },
  {
    label: "Profil",
    href: "/profil",
    icon: UserRound,
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full border-b border-primary/20 bg-card p-4 md:w-72 md:border-r md:border-b-0 md:p-5">
      <div className="mb-6">
        <p className="text-primary text-xs font-semibold tracking-[0.2em]">AR STORE</p>
        <h1 className="mt-2 text-xl font-semibold">Inventory Handphone</h1>
      </div>

      <nav className="grid gap-1.5">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                active
                  ? "bg-primary text-primary-foreground shadow-[0_10px_20px_rgba(1,141,138,0.22)]"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
