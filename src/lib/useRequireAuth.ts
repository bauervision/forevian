// src/lib/useRequireAuth.ts
"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/providers/AuthProvider";

export function useRequireAuth() {
  const { user, loading } = useAuth();
  const r = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      r.replace(`/login?next=${encodeURIComponent(path || "/")}`);
    }
  }, [loading, user, r, path]);

  // while checking or unauth, render nothing to prevent Firestore hooks from mounting
  return { ready: !loading && !!user };
}
