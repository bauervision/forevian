// app/dashboard/category/[slug]/page.tsx
import { Suspense } from "react";
import ClientCategoryPage from "./ClientCategoryPage";
import { catToSlug } from "@/lib/slug";

// Prevent unexpected dynamic params during export
export const dynamicParams = false;

// ✅ Tell Next.js which slugs to prebuild for static export
export function generateStaticParams() {
  // Top-level category/group names you surface elsewhere in the app.
  // Add/remove here as your taxonomy evolves.
  const GROUPS = [
    "Groceries",
    "Fast Food",
    "Dining",
    "Fuel",
    "Home/Utilities",
    "Insurance",
    "Subscriptions",
    "Shopping",
    "Debt",
    "Entertainment",
    "Cash Back",
    "Impulse/Misc",
    "Uncategorized",
  ];

  return GROUPS.map((name) => ({ slug: catToSlug(name) }));
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading category…
        </div>
      }
    >
      <ClientCategoryPage />
    </Suspense>
  );
}
