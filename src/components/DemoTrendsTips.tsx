// app/components/DemoTrendsTips.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import BottomCoach from "@/components/BottomCoach";

export default function DemoTrendsTips() {
  const pathname = usePathname();
  const isDemoTrends =
    typeof pathname === "string" &&
    pathname.startsWith("/demo") &&
    /\/trend($|\/)/i.test(pathname);

  if (!isDemoTrends) return null;

  const steps = [
    {
      title: "Spot patterns at a glance",
      body: (
        <>
          This view helps you compare months and see which categories are
          trending up or down. Use it to quickly find spikes and seasonality.
        </>
      ),
    },
    {
      title: "Change the time scope",
      body: (
        <>
          Use the <b>Period</b> toggle to switch between <b>Current</b> and{" "}
          <b>YTD</b>. Pair it with the <b>Statement</b> switcher to hop between
          specific months.
        </>
      ),
    },
    {
      title: "Drill into the why",
      body: (
        <>
          When you notice a jump in a category, open that category from the
          Dashboard → <b>Categories</b> page to see the exact transactions and
          merchants behind it.
        </>
      ),
    },
    {
      title: "Track real progress",
      body: (
        <>
          Trends works best after you’ve cleaned up categories in the{" "}
          <b>Reconciler</b> (e.g., moving Walmart to Groceries or creating a
          Starbucks category). Those choices carry through here automatically.
        </>
      ),
    },
    {
      title: "Ready to try it with your own data?",
      body: (
        <>
          Create an account and start importing your statements.{" "}
          <a
            href="/login"
            className="underline decoration-emerald-500 underline-offset-2 hover:opacity-90"
          >
            Sign up →
          </a>
        </>
      ),
    },
  ];

  return <BottomCoach id="demo-trends-tips-v1" steps={steps} startOpen />;
}
