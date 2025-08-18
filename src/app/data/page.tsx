"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Tx } from "@/lib/types";
import {
  canonicalCategory,
  canonicalMerchant,
  detectSpender,
  extractCashBack,
  recurrenceKey,
} from "@/lib/normalize";

type Spender = "All" | "Mike" | "Beth";
type SortKey =
  | "date"
  | "merchant"
  | "category"
  | "spender"
  | "channel"
  | "amount"
  | "cashback"
  | "purchase";

type Row = Tx & {
  _merchant?: string;
  _category: string;
  _spender: "Mike" | "Beth" | "Unknown";
  _cashback: number; // parsed from description
  _grossAbs: number; // abs(amount)
  _purchaseAbs: number; // abs(amount) - cashback for expenses
  _dir: "INCOME" | "EXPENSE";
  _rkey: string;
};

const ALL_CATS: string[] = [
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
  "Cash",
];

export default function DataPage() {
  const [user, setUser] = useState<any>(null);
  const [raw, setRaw] = useState<Tx[]>([]);
  const [spender, setSpender] = useState<Spender>("All");
  const [cats, setCats] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [hasCB, setHasCB] = useState<"any" | "yes" | "no">("any");
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [channel, setChannel] = useState<"any" | "card" | "ach">("any");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) return;
    const col = collection(db, "users", user.uid, "transactions");
    const qy = query(col, orderBy("date", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      setRaw(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Tx[]
      );
    });
    return () => unsub();
  }, [user]);

  const rows: Row[] = useMemo(() => {
    const map = (t: Tx): Row => {
      const desc = t.description || "";
      const merch = canonicalMerchant(desc) || t.merchant || undefined;
      const category = canonicalCategory(desc, t.category);
      const sp = detectSpender(desc, t.cardLast4) || t.spender || "Unknown";
      const cb = extractCashBack(desc);
      const dir = t.amount >= 0 ? "INCOME" : "EXPENSE";
      const grossAbs = Math.abs(t.amount);
      const purchaseAbs =
        dir === "EXPENSE" ? Math.max(0, grossAbs - cb) : grossAbs;
      return {
        ...t,
        _merchant: merch,
        _category: category,
        _spender: sp,
        _cashback: cb,
        _grossAbs: +grossAbs.toFixed(2),
        _purchaseAbs: +purchaseAbs.toFixed(2),
        _dir: dir,
        _rkey: recurrenceKey(desc),
      };
    };
    return raw.map(map);
  }, [raw]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (spender !== "All" && r._spender !== spender) return false;
      if (cats.length && !cats.includes(r._category)) return false;
      if (channel !== "any" && (r.channel || "ach") !== channel) return false;
      if (recurringOnly && !r.isRecurring) return false;
      if (hasCB === "yes" && !(r._cashback > 0)) return false;
      if (hasCB === "no" && r._cashback > 0) return false;
      if (start && r.date < start) return false;
      if (end && r.date > end) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${r.description} ${r._merchant ?? ""} ${r._category} ${
          r._spender
        }`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, spender, cats, channel, recurringOnly, hasCB, start, end, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const m = (r: Row) => {
      switch (sortBy) {
        case "date":
          return r.date;
        case "merchant":
          return r._merchant ?? "";
        case "category":
          return r._category;
        case "spender":
          return r._spender;
        case "channel":
          return r.channel ?? "";
        case "cashback":
          return r._cashback;
        case "purchase":
          return r._purchaseAbs * (r._dir === "EXPENSE" ? -1 : 1);
        case "amount":
        default:
          return r.amount;
      }
    };
    arr.sort((a, b) => {
      const va = m(a),
        vb = m(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  const totals = useMemo(() => {
    let income = 0,
      expense = 0,
      purchase = 0,
      cashback = 0;
    for (const r of filtered) {
      if (r.amount >= 0) income += r.amount;
      else expense += Math.abs(r.amount);
      cashback += r._cashback;
      if (r._dir === "EXPENSE") purchase += r._purchaseAbs;
    }
    return {
      count: filtered.length,
      income: +income.toFixed(2),
      expense: +expense.toFixed(2),
      net: +(income - expense).toFixed(2),
      cashback: +cashback.toFixed(2),
      purchase: +purchase.toFixed(2),
    };
  }, [filtered]);

  const toggleSort = (k: SortKey) => {
    if (sortBy === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(k);
      setSortDir(k === "date" ? "desc" : "asc");
    }
  };

  const exportCsv = () => {
    const cols = [
      "date",
      "description",
      "merchant",
      "category",
      "spender",
      "channel",
      "gross",
      "cashback",
      "purchase",
    ];
    const lines = [cols.join(",")];
    for (const r of sorted) {
      const row = [
        r.date,
        JSON.stringify(r.description),
        JSON.stringify(r._merchant ?? ""),
        r._category,
        r._spender,
        r.channel ?? "",
        r.amount.toFixed(2),
        r._cashback.toFixed(2),
        (r._dir === "EXPENSE" ? -r._purchaseAbs : r._purchaseAbs).toFixed(2),
      ].join(",");
      lines.push(row);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "forevian_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user)
    return <main className="max-w-6xl mx-auto p-6">Please sign in.</main>;

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Forevian — Data</h1>
        <button
          onClick={exportCsv}
          className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="grid md:grid-cols-4 gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Spender:</span>
          {(["All", "Mike", "Beth"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSpender(v)}
              className={`px-2 py-1 rounded ${
                spender === v ? "bg-cyan-600" : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Channel:</span>
          {(["any", "card", "ach"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setChannel(v)}
              className={`px-2 py-1 rounded ${
                channel === v ? "bg-cyan-600" : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Cash-back:</span>
          {(["any", "yes", "no"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setHasCB(v as any)}
              className={`px-2 py-1 rounded ${
                hasCB === v ? "bg-cyan-600" : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <label className="text-sm flex">
          <input
            type="checkbox"
            checked={recurringOnly}
            onChange={(e) => setRecurringOnly(e.target.checked)}
            className="mr-2"
          />
          Recurring only
        </label>

        <input
          placeholder="Search description / merchant / category"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800 md:col-span-2"
        />

        <div className="flex gap-2">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800 w-full"
          />
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800 w-full"
          />
        </div>

        <div className="flex flex-wrap gap-2 md:col-span-2">
          {ALL_CATS.map((c) => {
            const on = cats.includes(c);
            return (
              <button
                key={c}
                onClick={() =>
                  setCats(on ? cats.filter((x) => x !== c) : [...cats, c])
                }
                className={`px-2 py-1 rounded text-xs ${
                  on ? "bg-cyan-600" : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                {c}
              </button>
            );
          })}
          {cats.length > 0 && (
            <button
              onClick={() => setCats([])}
              className="px-2 py-1 rounded text-xs bg-zinc-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Totals */}
      <div className="rounded-xl border border-zinc-800 p-4 text-sm grid sm:grid-cols-5 gap-3">
        <div>
          <div className="opacity-70">Rows</div>
          <div className="font-medium">{totals.count}</div>
        </div>
        <div>
          <div className="opacity-70">Income</div>
          <div className="text-green-300">+${totals.income.toFixed(2)}</div>
        </div>
        <div>
          <div className="opacity-70">Expense (gross)</div>
          <div className="text-red-300">-${totals.expense.toFixed(2)}</div>
        </div>
        <div>
          <div className="opacity-70">Cash-back</div>
          <div>${totals.cashback.toFixed(2)}</div>
        </div>
        <div>
          <div className="opacity-70">Expense (purchase)</div>
          <div className="text-red-300">-${totals.purchase.toFixed(2)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-zinc-800">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-zinc-950 sticky top-0">
            <tr>
              {[
                ["date", "Date"],
                ["merchant", "Merchant"],
                ["category", "Category"],
                ["spender", "Spender"],
                ["channel", "Channel"],
                ["amount", "Gross"],
                ["cashback", "Cash-back"],
                ["purchase", "Purchase"],
                ["desc", "Description"],
              ].map(([key, label]) => (
                <th
                  key={key}
                  scope="col"
                  className="px-3 py-2 text-left font-medium"
                >
                  {key === "desc" ? (
                    label
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSort(key as any)}
                      className="cursor-pointer hover:underline"
                    >
                      {label}
                      {sortBy === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-800">
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono text-xs">{r.date}</td>
                <td className="px-3 py-2">{r._merchant ?? ""}</td>
                <td className="px-3 py-2">{r._category}</td>
                <td className="px-3 py-2">{r._spender}</td>
                <td className="px-3 py-2">{r.channel ?? ""}</td>
                <td
                  className={`px-3 py-2 ${
                    r.amount < 0 ? "text-red-300" : "text-green-300"
                  }`}
                >
                  {r.amount < 0 ? "−" : "+"}${Math.abs(r.amount).toFixed(2)}
                </td>
                <td className="px-3 py-2">${r._cashback.toFixed(2)}</td>
                <td className="px-3 py-2">
                  {r._dir === "EXPENSE" ? (
                    <>-${r._purchaseAbs.toFixed(2)}</>
                  ) : (
                    <>+{r._purchaseAbs.toFixed(2)}</>
                  )}
                </td>
                <td className="px-3 py-2 opacity-80">{r.description}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center opacity-70">
                  No rows match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
