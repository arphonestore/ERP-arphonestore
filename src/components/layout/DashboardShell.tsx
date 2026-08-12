"use client";

import { type ReactNode, useState } from "react";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

type DashboardShellProps = {
  children: ReactNode;
  userName: string;
};

export function DashboardShell({ children, userName }: DashboardShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,rgba(1,141,138,0.12),transparent_35%),radial-gradient(circle_at_100%_100%,rgba(99,102,241,0.12),transparent_30%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(12,186,183,0.14),transparent_30%),radial-gradient(circle_at_100%_100%,rgba(67,56,202,0.18),transparent_32%)]" />
      <div className="flex min-h-screen">
        <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

        <div className="min-w-0 flex-1 md:pl-0">
          <Header onOpenSidebar={() => setMobileSidebarOpen(true)} userName={userName} />

          <main className="p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
