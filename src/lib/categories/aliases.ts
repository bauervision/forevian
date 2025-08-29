// somewhere shared, e.g. lib/categories/aliases.ts
import { catToSlug } from "@/lib/slug";
import type { Category } from "@/app/providers/CategoriesProvider";

export const NAME_ALIAS_TO_SLUG: Record<string, string> = {
  utilities: "home-utilities",
  utility: "home-utilities",
  housing: "rent-mortgage",
  gas: "fuel",
  "amazon marketplace": "shopping", // or a dedicated cat if you have one
  "transfer:savings": "transfer-savings",
  "transfer : savings": "transfer-savings",
  "transfer-savings": "transfer-savings",
  "transfer:investing": "transfer-investing",
  "transfer : investing": "transfer-investing",
  "transfer-investing": "transfer-investing",
};

export function resolveAliasNameToCategory(
  name: string,
  categories: Category[]
): Category | null {
  const raw = (name || "").trim();
  if (!raw) return null;

  const bySlug = new Map(
    categories.map((c) => [(c.slug || "").toLowerCase(), c] as const)
  );
  const byName = new Map(
    categories.map((c) => [c.name.toLowerCase(), c] as const)
  );

  // 1) exact name hit
  const exact = byName.get(raw.toLowerCase());
  if (exact) return exact;

  // 2) alias → slug
  const aliasKey = raw.toLowerCase().replace(/\s+/g, " ");
  const targetSlug =
    NAME_ALIAS_TO_SLUG[aliasKey] || NAME_ALIAS_TO_SLUG[catToSlug(raw)];
  if (targetSlug) {
    const hit = bySlug.get(targetSlug);
    if (hit) return hit;
  }

  // 3) slug hit
  const s = catToSlug(raw);
  const byS = bySlug.get(s);
  if (byS) return byS;

  return null;
}
