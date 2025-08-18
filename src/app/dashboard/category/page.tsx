"use client";
import Link from "next/link";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { computeTotals, type MinimalTx } from "@/lib/metrics";
import { slug } from "@/lib/slug";

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function CategoriesPage() {
  const { transactions, inputs } = useReconcilerSelectors();
  const rows = transactions as unknown as MinimalTx[];
  const t = computeTotals(rows, inputs.beginningBalance ?? 0);

  const cats = Object.entries(t.byCategory).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1])
  );

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Categories</h1>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="text-left p-2">Category</th>
            <th className="text-right p-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {cats.map(([cat, sum]) => (
            <tr key={cat} className="border-t">
              <td className="p-2">
                <Link
                  className="hover:underline"
                  href={`/dashboard/category/${slug(cat)}`}
                >
                  {cat}
                </Link>
              </td>
              <td
                className={
                  "p-2 text-right " +
                  (sum < 0
                    ? "text-red-700 dark:text-red-400"
                    : "text-emerald-700 dark:text-emerald-400")
                }
              >
                {money(sum)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500">
        Click a category to see merchant breakdown.
      </p>
    </div>
  );
}
