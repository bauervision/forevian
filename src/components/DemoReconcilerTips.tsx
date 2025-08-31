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

  // Only compute these booleans (they can change), but we won't
  // pass them through to BottomCoach after initial mount.
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

  // Freeze startOpen on first render so it doesn't flip when categories/rules change
  const initialOpenRef = React.useRef<boolean | null>(null);
  if (initialOpenRef.current === null) {
    initialOpenRef.current = hasWalmartShopping || hasStarbucksDining;
  }

  // Keep steps identity stable so children don’t think props changed deeply
  const steps = React.useMemo(
    () => [
      {
        title: "Welcome to the Reconciler",
        body: (
          <>
            This page helps you reconcile a statement: review transactions,
            adjust categories, and see totals update instantly. Changes are
            saved in your browser for this demo.
          </>
        ),
      },
      {
        title: "Fix a common mismatch",
        body: (
          <>
            Notice how <b>Walmart</b> may show as <i>Shopping</i>. For grocery
            runs, that’s better as <b>Groceries</b>. Try changing one Walmart
            row to “Groceries” — matching transactions will follow this new
            category going forward.
          </>
        ),
      },
      {
        title: "Create a brand-specific category",
        body: (
          <>
            Scroll to the <b>Ultra Salon</b> transaction. Open the category
            menu, choose <b>＋ Add Category…</b>, create a new category named{" "}
            <b>Hair Appointments</b>, then select it for that transaction. This
            is handy when you want to track specific merchants or sub-budgets
            precisely.
          </>
        ),
      },
      {
        title: "What else can you do here?",
        body: (
          <>
            Try switching between the other demo statements (June–August) to see
            how patterns change. When you’re done reconciling, head to the{" "}
            <b>Dashboard</b> to explore your categories and merchant breakdowns.
          </>
        ),
      },
    ],
    []
  );

  return (
    <BottomCoach
      id="ui.demo.reconciler.tips.v2" // stable, versioned key for localStorage
      steps={steps}
      startOpen={!!initialOpenRef.current} // only honored once
    />
  );
}
