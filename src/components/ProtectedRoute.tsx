// src/components/ProtectedRoute.tsx
"use client";
import React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = React.useState<"loading" | "authed" | "guest">(
    "loading"
  );

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setStatus("authed");
      } else {
        setStatus("guest");
        // bounce to login, preserving intended path
        const next = encodeURIComponent(pathname || "/dashboard");
        router.replace(`/login?next=${next}`);
      }
    });
    return () => unsub();
  }, [router, pathname]);

  if (status !== "authed") {
    // lightweight placeholder (keeps layout stable)
    return (
      <div className="min-h-[50vh] grid place-items-center text-slate-400">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
