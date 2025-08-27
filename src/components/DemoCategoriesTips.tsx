// app/components/DemoCategoriesTips.tsx
"use client";

import React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import BottomCoach from "@/components/BottomCoach";

export default function DemoCategoriesTips() {
  const pathname = usePathname();
  const sp = useSearchParams();

  // Only on demo Categories index (NOT the slug page and NOT the slug=? fallback)
  const parts = (pathname || "").split("/").filter(Boolean); // e.g. ["demo","dashboard","category"]
  const onDemoCategoriesIndex =
    parts[0] === "demo" &&
    parts[1] === "dashboard" &&
    parts[2] === "category" &&
    parts.length === 3 &&
    !sp.get("slug");

  if (!onDemoCategoriesIndex) return null;

  const steps = [
    {
      title: "Browse your categories",
      body: (
        <>
          Each card represents a category. <b>Click a card</b> to open that
          category and see all of its transactions, merchants, and spend trend.
        </>
      ),
    },
    {
      title: "Edit Categories (and a heads-up)",
      body: (
        <>
          Use the <b>Edit Categories</b> button here to add, rename, or remove
          categories. If you <i>add a new category</i> on this screen, it won’t
          appear as a card yet—because no transactions use it. Assign it to a
          transaction in the <b>Reconciler</b>, and it’ll show up automatically.
        </>
      ),
    },
    {
      title: "Next: Budgets",
      body: (
        <>
          When you’re done exploring, head to <b>Budgets</b> to see monthly
          targets and how your spending stacks up. You can fine-tune limits and
          spot where to dial things back.
        </>
      ),
    },
  ];

  return <BottomCoach id="demo-categories-tips-v1" steps={steps} startOpen />;
}
