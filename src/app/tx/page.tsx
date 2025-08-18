"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { addTx, onTxSnapshot, ensureSettings } from "@/lib/db";
import type { Tx, Category } from "@/lib/types";

const cats: Category[] = [
  "Groceries",
  "Dining",
  "Utilities",
  "Gas",
  "Housing",
  "Debt",
  "Insurance",
  "Subscriptions",
  "Healthcare",
  "Kids/School",
  "Entertainment",
  "Shopping/Household",
  "Amazon",
  "Impulse/Misc",
  "Transfers",
];

export default function TxPage() {
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<Tx[]>([]);
  const [form, setForm] = useState<Tx>({
    date: new Date().toISOString().slice(0, 10),
    postDay: new Date().getDate(),
    description: "",
    amount: -25.0,
    category: "Impulse/Misc",
    accountId: "wells-checking",
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await ensureSettings();
        const off = onTxSnapshot(setRows);
        return () => off();
      } else {
        setRows([]);
      }
    });
    return () => unsub();
  }, []);

  const submit = async () => {
    if (!user) return alert("Sign in first");
    if (!form.description) return alert("Add a description");
    await addTx({
      ...form,
      // basic spender detection from card
      spender:
        form.cardLast4 === "5280"
          ? "Mike"
          : form.cardLast4 === "0161"
          ? "Wife"
          : "Unknown",
    } as Tx);
    setForm((f) => ({ ...f, description: "", amount: -25 }));
  };

  if (!user) {
    return (
      <main className="max-w-xl mx-auto p-6">
        Please sign in, then return here.
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Forevian — Transactions</h1>

      <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
          />
          <input
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
          />
          <input
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) =>
              setForm({ ...form, amount: parseFloat(e.target.value) })
            }
            className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
          />
          <select
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value as any })
            }
            className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
          >
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            placeholder="Card last 4 (5280/0161)"
            value={form.cardLast4 || ""}
            onChange={(e) => setForm({ ...form, cardLast4: e.target.value })}
            className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
          />
          <input
            placeholder="Merchant (optional)"
            value={form.merchant || ""}
            onChange={(e) => setForm({ ...form, merchant: e.target.value })}
            className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
          />
        </div>
        <button
          onClick={submit}
          className="px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-700"
        >
          Add Transaction
        </button>
        <div className="text-xs opacity-70">
          Tip: expenses are negative (e.g., <code>-25.00</code>), income is
          positive.
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800">
        <div className="px-4 py-2 border-b border-zinc-800 text-sm opacity-70">
          Recent
        </div>
        <div className="divide-y divide-zinc-800">
          {rows.map((r) => (
            <div
              key={r.id}
              className="px-4 py-2 flex items-center justify-between text-sm"
            >
              <div className="flex-1">
                <div className="font-medium">{r.description}</div>
                <div className="opacity-70">
                  {r.category}
                  {r.subcategory ? ` • ${r.subcategory}` : ""} •{" "}
                  {r.spender ?? "Unknown"}
                </div>
              </div>
              <div className={r.amount < 0 ? "text-red-300" : "text-green-300"}>
                {r.amount < 0 ? "−" : "+"}${Math.abs(r.amount).toFixed(2)}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="px-4 py-6 opacity-60 text-sm">
              No transactions yet.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
