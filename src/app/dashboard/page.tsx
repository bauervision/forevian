"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Tx } from "@/lib/types";
import { SpenderFilter } from "@/components/SpenderFilter";
import { CategoryChart } from "@/components/CategoryChart";
import { AmazonBreakdown } from "@/components/AmazonBreakdown";
import { BillCalendar } from "@/components/BillCalendar";
import {
  spendingByCategory,
  amazonBreakdown,
  buildRecurringCalendar,
  forecastTypicalMonth,
  filterBySpender,
} from "@/lib/compute";
import { SafeToInvestChart } from "@/components/SafeToInvestChart";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [spender, setSpender] = useState<"All" | "Mike" | "Beth">("All");

  // auth
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // live transactions for current user
  useEffect(() => {
    if (!user) return;
    const col = collection(db, "users", user.uid, "transactions");
    const qy = query(col, orderBy("date", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Tx[];
      setTxs(rows);
    });
    return () => unsub();
  }, [user]);

  const filtered = useMemo(() => filterBySpender(txs, spender), [txs, spender]);

  // Charts & views
  const catData = useMemo(() => spendingByCategory(filtered), [filtered]);
  const amazon = useMemo(() => amazonBreakdown(filtered), [filtered]);
  const recurring = useMemo(() => buildRecurringCalendar(filtered), [filtered]);
  const forecast = useMemo(() => forecastTypicalMonth(recurring), [recurring]);

  if (!user)
    return <main className="max-w-5xl mx-auto p-6">Please sign in first.</main>;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Forevian — Dashboard</h1>
        <SpenderFilter value={spender} onChange={setSpender} />
      </div>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-zinc-900 p-4 shadow">
          <h3 className="font-medium mb-2">Spending by Category</h3>
          <CategoryChart data={catData} />
        </div>
        <div className="rounded-2xl bg-zinc-900 p-4 shadow">
          <h3 className="font-medium mb-2">Amazon Breakdown</h3>
          <AmazonBreakdown total={amazon.total} parts={amazon.parts} />
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-zinc-900 p-4 shadow">
          <h3 className="font-medium mb-2">Recurring Bill Calendar</h3>
          <BillCalendar rows={recurring} />
        </div>
        <div className="rounded-2xl bg-zinc-900 p-4 shadow">
          <h3 className="font-medium mb-2">Safe-to-Invest (Typical Month)</h3>
          <SafeToInvestChart data={forecast} />
        </div>
      </section>
    </main>
  );
}
