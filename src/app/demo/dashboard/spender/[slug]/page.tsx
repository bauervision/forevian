// app/dashboard/spender/[slug]/page.tsx
import ClientSpenderPage from "@/app/dashboard/spender/[slug]/ClientSpenderPage";
import { Suspense } from "react";

// Prevent unexpected params at runtime for static export
export const dynamicParams = false;

// ✅ List the spender slugs you want statically exported
export function generateStaticParams() {
  // Pick the set you actually use. You can add/remove anytime and rebuild.
  const SPENDERS = [
    "joint",
    "you",
    "spouse",
    "primary",
    "secondary",
    // If you use named profiles, include them here:
    "husband",
    "wife",
  ];
  return SPENDERS.map((slug) => ({ slug }));
}

export default function DempSpenderPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading demo spender…
        </div>
      }
    >
      <ClientSpenderPage />
    </Suspense>
  );
}
