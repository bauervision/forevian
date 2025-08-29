// app/components/DemoBudgetTips.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import BottomCoach from "@/components/BottomCoach";

export default function DemoBudgetTips() {
  const pathname = usePathname();
  const isDemoBudget =
    typeof pathname === "string" &&
    pathname.startsWith("/demo") &&
    /\/budget(s)?/i.test(pathname); // works for /demo/budget or /demo/budgets

  if (!isDemoBudget) return null;

  const steps = [
    {
      title: "Set your targets",
      body: (
        <>
          Use the <b>Groceries</b>, <b>Savings</b>, and <b>Investing</b> sliders
          to set monthly targets. As you adjust, goals and progress bars update
          instantly so you can see the impact.
        </>
      ),
    },
    {
      title: "Groceries by week",
      body: (
        <>
          We split your monthly <b>Groceries</b> target across weeks
          automatically. Each week’s amount is proportional to how many days of
          that week fall in the month—so odd-length months stay fair and the
          monthly total stays exact.
        </>
      ),
    },
    {
      title: "Next Month planning",
      body: (
        <>
          Flip the toggle at the top to <b>Next Month</b>. You’ll see your
          weekly grocery targets and paycheck-weighted allocations projected
          forward—handy for planning before the month starts.
        </>
      ),
    },
    {
      title: "Available to Spend",
      body: (
        <>
          This shows how much budget remains after <i>Bills</i>,{" "}
          <i>Groceries</i>, <i>Savings</i>, and <i>Investing</i>. The{" "}
          <b>Per Paycheck</b> split helps you pace spending between paydays so
          you don’t front-load the month.
        </>
      ),
    },
    {
      title: "Bill calendar",
      body: (
        <>
          The calendar highlights days with <b>auto-drafted bills</b> and shows
          the <b>total due</b> that day. It’s an easy way to spot heavy cash-out
          days at a glance.
        </>
      ),
    },
    {
      title: "Add your mortgage",
      body: (
        <>
          Click on the <b>6th</b>. That’s your mortgage day. If it isn’t marked
          to appear here, toggle <b>Include in bill calendar</b>. From now on it
          will always show in this view.
        </>
      ),
    },
    {
      title: "Count transfers toward goals",
      body: (
        <>
          In a day’s view, you can mark a transfer as <b>Savings</b> or{" "}
          <b>Investing</b> so it counts toward those targets—great for tracking
          progress as you go.
        </>
      ),
    },
    {
      title: "Next up: Trends",
      body: (
        <>
          When you’re done, head to <b>Trends</b> to compare months and spot
          patterns in groceries, utilities, and more.
        </>
      ),
    },
  ];

  return <BottomCoach id="demo-budget-tips-v1" steps={steps} startOpen />;
}
