// app/demo/dashboard/category/[slug]/page.tsx
import ClientCategoryPage from "@/app/dashboard/category/[slug]/ClientCategoryPage";
import { DEMO_MONTHS } from "@/app/demo/data";
import { catToSlug } from "@/lib/slug";
import { groupLabelForCategory } from "@/lib/categoryGroups";

export const dynamicParams = false;

export function generateStaticParams() {
  const slugs = new Set<string>();

  for (const m of DEMO_MONTHS) {
    for (const t of m.cachedTx ?? []) {
      const raw = (t.categoryOverride ?? t.category ?? "Uncategorized").trim();

      // raw category slug (e.g., "amazon-marketplace")
      slugs.add(catToSlug(raw));

      // top-level group slug (e.g., "amazon")
      const group = groupLabelForCategory(raw);
      slugs.add(catToSlug(group));
    }
  }

  // Ensure a few common buckets exist even if no tx hit them in demo data
  ["Uncategorized", "Transfers", "Debt", "Cash Back"].forEach((c) =>
    slugs.add(catToSlug(c))
  );

  return Array.from(slugs).map((slug) => ({ slug }));
}

export default function Page() {
  return <ClientCategoryPage />;
}
