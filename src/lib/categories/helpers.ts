import { type Category } from "@/app/providers/CategoriesProvider";

export function coerceToSlug(
  nameOrSlug: string | undefined,
  categories: Category[],
  findBySlug: (s: string) => Category | undefined,
  findByNameCI: (n: string) => Category | undefined
): string {
  const v = (nameOrSlug || "").trim();
  if (!v) return "uncategorized";
  const asSlug = findBySlug(v)?.slug;
  if (asSlug) return asSlug;
  const asName = findByNameCI(v)?.slug;
  return asName || "uncategorized";
}
