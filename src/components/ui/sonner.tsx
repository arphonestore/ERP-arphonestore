"use client";

import { Toaster as SonnerToaster } from "sonner";

import { useTheme } from "@/components/providers/theme-provider";

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      richColors
      closeButton
      expand={false}
      toastOptions={{
        duration: 2800,
      }}
    />
  );
}
