// app/demo/slug-helpers.ts
import { DEMO_MONTHS } from "@/app/demo/data";
import { catToSlug } from "@/lib/slug";
import { groupLabelForCategory } from "@/lib/categoryGroups";

const PRE_DEMO_SLUGS = new Set<string>();
for (const m of DEMO_MONTHS) {
  for (const t of m.cachedTx ?? []) {
    const raw = (t.categoryOverride ?? t.category ?? "Uncategorized").trim();
    PRE_DEMO_SLUGS.add(catToSlug(raw));
    PRE_DEMO_SLUGS.add(catToSlug(groupLabelForCategory(raw)));
  }
}
["Uncategorized", "Transfers", "Debt", "Cash Back"].forEach((c) =>
  PRE_DEMO_SLUGS.add(catToSlug(c))
);

export function demoCategoryHref(slug: string) {
  const s = slug.toLowerCase();
  return PRE_DEMO_SLUGS.has(s)
    ? `/demo/dashboard/category/${s}`
    : `/demo/dashboard/category?slug=${encodeURIComponent(s)}`;
}
