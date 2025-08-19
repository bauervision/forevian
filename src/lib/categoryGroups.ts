// /lib/categoryGroups.ts
export type CategoryGroup = {
  slug: string; // route slug for the parent card
  label: string; // user-visible label
  members: string[]; // exact child category names in your data
};

// Central place to define grouped parents
const GROUPS: Record<string, CategoryGroup> = {
  amazon: {
    slug: "amazon",
    label: "Amazon",
    members: ["Amazon Marketplace", "Prime Video", "Amazon Fresh"],
  },
  // add more groups later...
  // streaming: { slug: "streaming", label: "Streaming", members: ["Netflix","Hulu","Disney+"] },
};

// ----- internals -----------------------------------------------------------

function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleizeFromSlug(slug: string) {
  return slug
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : ""))
    .join(" ");
}

// Lookups
const LABEL_TO_KEY = new Map<string, string>();
const MEMBER_TO_KEY = new Map<string, string>();

for (const key of Object.keys(GROUPS)) {
  const g = GROUPS[key];
  LABEL_TO_KEY.set(g.label.toLowerCase(), key);
  for (const m of g.members) MEMBER_TO_KEY.set(m.toLowerCase(), key);
}

// ----- public API (names your pages already import) -----------------------

/** Collapse a child (e.g., "Prime Video") to its parent label ("Amazon"), else return the original. */
export function groupLabelForCategory(cat: string): string {
  const key = MEMBER_TO_KEY.get(cat.trim().toLowerCase());
  return key ? GROUPS[key].label : cat;
}

/** Given a *parent* label, return the slug to use in links (e.g., "Amazon" -> "amazon"). */
export function topSlugForLabel(label: string): string {
  const key = LABEL_TO_KEY.get(label.trim().toLowerCase());
  return key ?? slugify(label);
}

/** Given a slug, return the list of member category names, or null if this slug is not a grouped parent. */
export function groupMembersForSlug(slug: string): string[] | null {
  return GROUPS[slug]?.members ?? null;
}

/** Given a slug, return the user-visible label. Falls back to a titleized slug. */
export function labelForSlug(slug: string): string {
  return GROUPS[slug]?.label ?? titleizeFromSlug(slug);
}
