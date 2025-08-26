// app/components/DemoReconcilerTips.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import BottomCoach from "@/components/BottomCoach";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";

export default function DemoReconcilerTips() {
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;
  if (!isDemo) return null;

  const { transactions } = useReconcilerSelectors();

  // Auto-open if a Walmart row is still “Shopping”, *or* if Starbucks is still in Dining.
  const hasWalmartShopping = React.useMemo(
    () =>
      transactions.some(
        (t) =>
          /walmart/i.test(t.description || "") &&
          /(shopping)/i.test(t.categoryOverride ?? t.category ?? "")
      ),
    [transactions]
  );

  const hasStarbucksDining = React.useMemo(
    () =>
      transactions.some(
        (t) =>
          /starbucks/i.test(t.description || "") &&
          /(dining|restaurant|coffee)/i.test(
            t.categoryOverride ?? t.category ?? ""
          )
      ),
    [transactions]
  );

  const steps = [
    {
      title: "Welcome to the Reconciler",
      body: (
        <>
          This page helps you reconcile a statement: review transactions, adjust
          categories, and see totals update instantly. Changes are saved in your
          browser for this demo.
        </>
      ),
    },
    {
      title: "Fix a common mismatch",
      body: (
        <>
          Notice how <b>Walmart</b> may show as <i>Shopping</i>. For grocery
          runs, that’s better as <b>Groceries</b>. Try changing one Walmart row
          to “Groceries” — matching transactions will follow this new category
          going forward.
        </>
      ),
    },
    {
      title: "Create a brand-specific category",
      body: (
        <>
          Scroll to the <b>Starbucks</b> transaction. Open the category menu,
          choose <b>＋ Add Category…</b>, create a new category named{" "}
          <b>Starbucks</b>, then select it for that transaction. This is handy
          when you want to track specific merchants or sub-budgets precisely.
        </>
      ),
    },
    {
      title: "What else can you do here?",
      body: (
        <>
          You can change any category, add notes, and filter by statement. Head
          to the Categories view for rules, or the Budget page to see how
          savings, investing, and groceries targets line up with your income.
        </>
      ),
    },
  ];

  return (
    <BottomCoach
      id="demo-reconciler-v1"
      steps={steps}
      startOpen={hasWalmartShopping || hasStarbucksDining}
    />
  );
}
