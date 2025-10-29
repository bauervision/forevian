"use client";
import { useMemo, useRef } from "react";
import { exportToPdf } from "@/lib/pdf/export";
import {
  fmtCurrency,
  isExpense,
  inRange,
  rollupByCategory,
  Tx,
} from "@/lib/expenses/selectors";

type Props = {
  title?: string;
  transactions: Tx[];
  from: Date;
  to: Date;
  selectedCategories?: string[]; // optional filter; if empty, show all expense cats
};

export default function ExpensesReport({
  title = "Current Expenses",
  transactions,
  from,
  to,
  selectedCategories,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { rows, grandTotal, count } = useMemo(() => {
    const filtered = transactions
      .filter(isExpense)
      .filter((t) => inRange(t, from, to))
      .filter(
        (t) =>
          !selectedCategories?.length ||
          selectedCategories.includes(t.category || "Uncategorized")
      );

    const rollups = rollupByCategory(filtered);
    const sum = filtered.reduce((acc, t) => acc + t.amount, 0);
    return { rows: rollups, grandTotal: sum, count: filtered.length };
  }, [transactions, from, to, selectedCategories]);

  async function handleExport() {
    if (!rootRef.current) return;
    await exportToPdf(rootRef.current, {
      filename: `Expenses-${formatRange(from, to)}.pdf`,
      margin: 24,
      scale: 2.5,
    });
  }

  return (
    <div className="expenses-pdf-skin">
      {/* Toolbar (hidden in PDF/print) */}
      <div className="hide-on-print mb-3 flex items-center gap-2">
        <button
          onClick={handleExport}
          className="px-3 py-1.5 rounded-md border shadow-sm hover:bg-gray-50"
        >
          Export as PDF
        </button>
        <div className="text-sm text-gray-500">
          {formatRange(from, to)} • {count} transactions
        </div>
      </div>

      {/* Report card (captured to PDF) */}
      <div ref={rootRef} className="report-card">
        <h1>{title}</h1>
        <div className="text-[11px] text-slate-600 mb-2">
          {formatRange(from, to)}
        </div>

        {rows.map(({ category, items, total }) => (
          <div key={category} className="mb-5">
            <h2>
              {category} —{" "}
              <span className="font-normal">{fmtCurrency(total)}</span>
            </h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>Date</th>
                  <th style={{ width: "32%" }}>Merchant</th>
                  <th style={{ width: "30%" }}>Note</th>
                  <th style={{ width: "20%" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .sort(
                    (a, b) =>
                      new Date(a.date).getTime() - new Date(b.date).getTime()
                  )
                  .map((tx) => (
                    <tr key={tx.id}>
                      <td>{new Date(tx.date).toLocaleDateString()}</td>
                      <td>{tx.merchant || "—"}</td>
                      <td>{tx.note || "—"}</td>
                      <td>{fmtCurrency(tx.amount)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Subtotal — {category}</td>
                  <td>{fmtCurrency(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}

        <table>
          <tfoot>
            <tr>
              <td colSpan={3}>Grand Total (All Categories)</td>
              <td>{fmtCurrency(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function formatRange(from: Date, to: Date) {
  const f = from.toLocaleDateString();
  const t = to.toLocaleDateString();
  return f === t ? f : `${f} – ${t}`;
}
