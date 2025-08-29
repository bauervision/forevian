// lib/slug.ts
import type { Category } from "@/app/providers/CategoriesProvider";

/** Canonical slugger for categories (accent-stripping, & → and, "/" → "-", etc.) */
// lib/slug.ts
export const catToSlug = (name: string) =>
  (name || "")
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/&/g, " and ")
    .replace(/\//g, "-") // keep slashes as hyphens
    .replace(/[^a-z0-9]+/g, "-") // <-- fold ANY punctuation/space into "-"
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/** Pretty display from slug (fallback only; prefer real category.name when you have it). */
export const slugToPretty = (s: string) =>
  decodeURIComponent(s || "")
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

/** Find a Category by slug (case-insensitive). */
export function findCategoryBySlug(categories: Category[], slug: string) {
  const key = decodeURIComponent(slug || "").toLowerCase();
  return categories.find((c) => (c.slug || "").toLowerCase() === key);
}

/** Ensure every category has a good slug; dedupe if collisions occur. */
export function ensureSlugsUnique(categories: Category[]): Category[] {
  const seen = new Set<string>();
  return categories.map((c) => {
    let base = c.slug && c.slug.trim() ? c.slug : catToSlug(c.name);
    if (!base) base = catToSlug(c.id || "category");
    let slug = base;
    let i = 2;
    while (seen.has(slug)) slug = `${base}-${i++}`;
    seen.add(slug);
    return { ...c, slug };
  });
}
