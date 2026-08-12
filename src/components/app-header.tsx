"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AppHeader() {
  const router = useRouter();
  const { data: session } = useSession();

  const displayName = useMemo(() => {
    return session?.user?.name ?? session?.user?.username ?? "Admin";
  }, [session?.user?.name, session?.user?.username]);

  const handleLogout = async () => {
    await signOut({
      callbackUrl: "/auth/login",
      redirect: false,
    });

    router.push("/auth/login");
    router.refresh();
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background/80 px-4 py-4 backdrop-blur md:px-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">ADMIN PANEL</p>
        <h2 className="text-lg font-semibold">Halo, {displayName}</h2>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="secondary">Peran: Admin</Badge>
        <Button variant="outline" onClick={handleLogout}>
          Logout
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
