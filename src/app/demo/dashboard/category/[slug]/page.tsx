import ClientOnly from "./ClientOnly";
import { DEMO_MONTHS } from "@/app/demo/data";
import { catToSlug } from "@/lib/slug";

export const dynamicParams = false;

export function generateStaticParams() {
  const slugs = new Set<string>();
  for (const m of DEMO_MONTHS) {
    for (const t of m.cachedTx ?? []) {
      const leaf = (t.categoryOverride ?? t.category ?? "Uncategorized").trim();
      slugs.add(catToSlug(leaf));
    }
  }
  slugs.add(catToSlug("Uncategorized"));
  return Array.from(slugs).map((slug) => ({ slug }));
}

export default function Page({ params }: { params: { slug: string } }) {
  return <ClientOnly slug={params.slug} />;
}
