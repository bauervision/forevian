"use client";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { type MinimalTx, effectiveCategory } from "@/lib/metrics";
import { unslug } from "@/lib/slug";

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

// Simple merchant extractor: known brands first, else a cleaned stem from description
const BRAND_RX: Array<[RegExp, string]> = [
  [/chick-?fil-?a/i, "Chick-fil-A"],
  [/starbucks/i, "Starbucks"],
  [/mcdonald/i, "McDonald's"],
  [/wendy/i, "Wendy's"],
  [/taco\s*b(?:ell)?/i, "Taco Bell"],
  [/kfc\b/i, "KFC"],
  [/chipotle/i, "Chipotle"],
  [/panera/i, "Panera"],
  [/panda\s*express/i, "Panda Express"],
  [/arby/i, "Arby's"],
  [/domino/i, "Domino's"],
  [/pizza\s*hut/i, "Pizza Hut"],
  [/little\s*caesars/i, "Little Caesars"],
  [/jersey\s*mike/i, "Jersey Mike's"],
  [/jimmy\s*john/i, "Jimmy John's"],
  [/sonic/i, "Sonic"],
  [/five\s*guys/i, "Five Guys"],
  [/zaxby/i, "Zaxby's"],
  [/popeyes/i, "Popeyes"],
  [/qdoba/i, "Qdoba"],
  [/harris\s*te(?:eter)?|harris\s*te\b/i, "Harris Teeter"],
  [/amazon|amzn\.com\/bill|amazon\s*mktpl|prime\s*video/i, "Amazon"],
];

function merchantKey(desc: string) {
  for (const [rx, name] of BRAND_RX) if (rx.test(desc)) return name;
  // fallback: strip boilerplate and take first ~4 words
  let s = desc
    .replace(/purchase.*authorized on \d{1,2}\/\d{1,2}/i, "")
    .replace(/\bCard\s*\d{4}\b.*/i, "")
    .replace(/\b[P|S]\d{6,}\b.*/i, "")
    .trim();
  const words = s.split(/\s+/).slice(0, 4).join(" ");
  return words || "Unknown";
}

export default function CategoryDetailPage() {
  const params = useParams<{ slug: string }>();
  const cat = unslug(params.slug);
  const { transactions } = useReconcilerSelectors();

  const rowsAll = transactions as unknown as MinimalTx[];
  const rows = rowsAll.filter((r) => {
    if (cat.toLowerCase() === "income") return r.amount > 0; // deposits only
    return effectiveCategory(r) === cat;
  });

  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.amount >= 0) continue; // spend only
      const d = r.description ?? "";
      const k = merchantKey(d);
      m.set(k, (m.get(k) ?? 0) + Math.abs(r.amount));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const total = groups.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/category" className="text-sm hover:underline">
          ← Categories
        </Link>
        <h1 className="text-2xl font-bold">{cat}</h1>
      </div>

      <div className="rounded border p-4">
        <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">
          Total Spend
        </div>
        <div className="text-xl font-semibold">{money(total)}</div>
      </div>

      <div className="rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left p-2">Merchant</th>
              <th className="text-right p-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([name, amt]) => (
              <tr key={name} className="border-t">
                <td className="p-2">{name}</td>
                <td className="p-2 text-right">{money(amt)}</td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td className="p-4" colSpan={2}>
                  No spend in this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
