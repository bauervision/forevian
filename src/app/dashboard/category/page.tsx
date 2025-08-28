// app/dashboard/category/page.tsx
import { Suspense } from "react";
import ClientCategories from "./ClientCategories";

// Keep static-friendly (or just omit this line if you don't set dynamic elsewhere)
export const dynamic = "force-static";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading categories…
        </div>
      }
    >
      <ClientCategories />
    </Suspense>
  );
}
