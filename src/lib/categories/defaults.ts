// lib/categories/defaults.ts
import type { Category } from "@/app/providers/CategoriesProvider";
import { CANON_LIST } from "./canon";

export const DEFAULT_CATEGORIES: Category[] = CANON_LIST.map((c) => ({
  id: crypto.randomUUID?.() ?? `cat-${Math.random().toString(36).slice(2)}`,
  name: c.name,
  icon: c.icon,
  color: c.color,
  hint: c.hint,
  slug: c.slug,
}));
