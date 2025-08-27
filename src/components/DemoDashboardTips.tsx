"use client";

import React from "react";
import { usePathname } from "next/navigation";
import BottomCoach from "@/components/BottomCoach";

export default function DemoDashboardTips() {
  const pathname = usePathname();
  const onDemoDashboard = pathname === "/demo/dashboard"; // only the main dashboard

  if (!onDemoDashboard) return null;

  const steps = [
    {
      title: "Spend by Spender",
      body: (
        <>
          Tap any spender card to drill in. On the Spender view, use{" "}
          <b>Back to Dashboard</b> to return here.
        </>
      ),
    },
    {
      title: "YTD vs Current",
      body: (
        <>
          Use the <b>Period</b> toggle (top-right) to switch to <b>YTD</b>. YTD
          aggregates from January through the month of the selected statement.
        </>
      ),
    },
    {
      title: "Explore Top Categories",
      body: (
        <>
          You can also explore your top expense categories from here. Click the{" "}
          <b>Utilities</b> card to dive into those transactions—this will take
          you to the Utilities category view.
        </>
      ),
    },
  ];

  return <BottomCoach id="demo-dashboard-v1" steps={steps} startOpen />;
}
