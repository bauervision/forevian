"use client";
import React from "react";
import { useRouter } from "next/navigation";
import {
  upsertStatement,
  emptyStatement,
  makeId,
  monthLabel,
  writeCurrentId,
  readIndex,
} from "@/lib/statements";

// tiny helper
const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function DemoPage() {
  const r = useRouter();

  const seed = React.useCallback(() => {
    const year = 2025;
    const month = 6; // June
    const id = makeId(year, month);
    const s = emptyStatement(id, `${monthLabel(month)} ${year}`, year, month);

    // Sample tx rows (shape compatible with your Transaction type)
    const txs = [
      // deposits
      {
        id: "tx-dep-1",
        date: "06/01",
        description: "IBM Payroll Direct Deposit",
        amount: +5000,
        category: "Income",
        user: "Joint",
      },
      // expenses
      {
        id: "tx-1",
        date: "06/02",
        description: "HARRIS TEETER #123",
        amount: -145.67,
        category: "Groceries",
        user: "Beth",
        cardLast4: "0161",
      },
      {
        id: "tx-2",
        date: "06/03",
        description: "AMZN Mktp US*G4T92",
        amount: -72.34,
        category: "Amazon Marketplace",
        user: "Mike",
        cardLast4: "5280",
      },
      {
        id: "tx-3",
        date: "06/05",
        description: "Dominion Energy VA",
        amount: -210.49,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-4",
        date: "06/06",
        description: "Newrez (Mortgage)",
        amount: -1895.0,
        category: "Housing",
        user: "Joint",
      },
      {
        id: "tx-5",
        date: "06/08",
        description: "Shell #334 Fuel",
        amount: -64.88,
        category: "Gas",
        user: "Mike",
        cardLast4: "5280",
      },
      {
        id: "tx-6",
        date: "06/09",
        description: "Taste Unlimited",
        amount: -45.23,
        category: "Dining",
        user: "Beth",
        cardLast4: "0161",
      },
      {
        id: "tx-7",
        date: "06/12",
        description: "Blue Cross Insurance",
        amount: -120.33,
        category: "Insurance",
        user: "Joint",
      },
      {
        id: "tx-8",
        date: "06/15",
        description: "Netflix.com",
        amount: -86.12,
        category: "Subscriptions",
        user: "Joint",
      },
    ];

    // Statement inputs (for top KPIs & reconciliation math)
    const beginningBalance = 1200;
    const totalDeposits = 5000;
    const totalWithdrawals = 2640.06; // sum of expenses above

    const seeded = {
      ...s,
      inputs: {
        beginningBalance,
        totalDeposits,
        totalWithdrawals,
      },
      pagesRaw: [],
      cachedTx: txs,
    };

    upsertStatement(seeded);
    writeCurrentId(id);

    // Optional: ensure it shows up first in switchers
    const idx = readIndex();
    console.log("Demo seeded. Statements:", Object.keys(idx));

    r.replace(`/dashboard?statement=${id}`);
  }, [r]);

  return (
    <main className="min-h-[70vh] max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold">Live Demo</h1>
      <p className="mt-2 text-slate-300">
        This will seed a demo statement ({monthLabel(6)} 2025) locally and take
        you straight to the Dashboard. No sign-in required.
      </p>

      <div className="mt-6 flex gap-3">
        <button
          onClick={seed}
          className="rounded-xl px-4 py-2 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400"
        >
          Start the demo
        </button>
        <a
          href="/"
          className="rounded-xl px-4 py-2 border border-slate-700 hover:bg-slate-900"
        >
          Back
        </a>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-700 p-4 bg-slate-900">
        <div className="text-sm text-slate-400">What you'll see</div>
        <ul className="mt-2 space-y-1 text-sm">
          <li>• Real parsing UI, categories, brand logos/icons</li>
          <li>• Top KPIs, spender view, category cards & drill-downs</li>
          <li>
            • Everything runs in your browser; nothing is saved to the cloud
          </li>
        </ul>
      </div>
    </main>
  );
}
