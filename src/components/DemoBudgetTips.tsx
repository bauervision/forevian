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
          to set monthly targets. Adjusting these updates the goals and progress
          bars below so you can see the impact immediately.
        </>
      ),
    },
    {
      title: "Available to Spend",
      body: (
        <>
          This section shows how much budget remains for the period. The{" "}
          <b>Per Paycheck</b> breakdown helps you pace spending between paydays,
          so you don’t front-load the month.
        </>
      ),
    },
    {
      title: "Bill calendar",
      body: (
        <>
          The calendar highlights days with <b>auto-drafted bills</b> and the{" "}
          <b>total due</b> that day. It’s an easy way to spot heavy cash-out
          days at a glance.
        </>
      ),
    },
    {
      title: "Add missing bills to the calendar",
      body: (
        <>
          Click on the <b>6th</b>. You’ll see the mortgage day. If it isn’t
          marked to appear here, toggle <b>Include in bill calendar</b>. From
          now on it will always show in this view.
        </>
      ),
    },
    {
      title: "Count specific transactions toward goals",
      body: (
        <>
          You can open a day’s transactions and mark a transfer as{" "}
          <b>Savings</b> or <b>Investing</b> so it counts toward those targets.
          Great for tracking progress as you go.
        </>
      ),
    },
    {
      title: "Next up: Trends",
      body: (
        <>
          When you’re done here, head over to <b>Trends</b> to compare months
          and spot patterns in groceries, utilities, and more.
        </>
      ),
    },
  ];

  return <BottomCoach id="demo-budget-tips-v1" steps={steps} startOpen />;
}
