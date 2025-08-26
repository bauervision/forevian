// app/demo/dashboard/category/[slug]/page.tsx
import ClientCategoryPage from "@/app/dashboard/category/[slug]/ClientCategoryPage";
import { DEMO_MONTHS } from "@/app/demo/data";
import { catToSlug } from "@/lib/slug";
import { groupLabelForCategory } from "@/lib/categoryGroups";
import { Suspense } from "react";

export const dynamicParams = false;

export function generateStaticParams() {
  const slugs = new Set<string>();

  for (const m of DEMO_MONTHS) {
    for (const t of m.cachedTx ?? []) {
      const raw = (t.categoryOverride ?? t.category ?? "Uncategorized").trim();
      slugs.add(catToSlug(raw));
      slugs.add(catToSlug(groupLabelForCategory(raw)));
    }
  }

  ["Uncategorized", "Transfers", "Debt", "Cash Back"].forEach((c) =>
    slugs.add(catToSlug(c))
  );

  return Array.from(slugs).map((slug) => ({ slug }));
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading demo category…
        </div>
      }
    >
      <ClientCategoryPage />
    </Suspense>
  );
}
