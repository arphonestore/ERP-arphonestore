import type { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { authOptions } from "@/lib/auth-options";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <LayoutWithAuth>{children}</LayoutWithAuth>;
}

async function LayoutWithAuth({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/login");
  }

  return (
    <DashboardShell userName={session.user.name ?? session.user.username ?? "Admin AR Store"}>
      {children}
    </DashboardShell>
  );
}
