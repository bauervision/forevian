export const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const unslug = (s: string) =>
  s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export const catToSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/&/g, " and ")
    .replace(/\//g, "-") // ✅ convert slashes to hyphens
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const capitalize = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);

export const slugToCat = (slug: string, categories?: string[]) => {
  const s = decodeURIComponent(slug.toLowerCase());

  // Prefer exact match via catToSlug
  if (categories?.length) {
    const exact = categories.find((c) => catToSlug(c) === s);
    if (exact) return exact;

    // Legacy fallback: tolerate old slugs like "impulsemisc"
    const loose = s.replace(/[^a-z0-9]/g, "");
    const looseHit = categories.find(
      (c) => catToSlug(c).replace(/[^a-z0-9]/g, "") === loose
    );
    if (looseHit) return looseHit;
  }

  // Generic prettifier fallback
  return s.split("-").map(capitalize).join(" ");
};
