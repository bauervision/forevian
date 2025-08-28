// app/components/DemoCategorySlugTips.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import BottomCoach from "@/components/BottomCoach";
import { useClientSearchParam } from "@/lib/useClientSearchParams";

function prettify(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join(" ");
}

export default function DemoCategorySlugTips() {
  // Only show on demo category pages (SSG path or query fallback)
  const pathname = usePathname();

  const onDemoCategory =
    pathname?.startsWith("/demo/dashboard/category") ?? false;

  if (!onDemoCategory) return null;

  const slug = (
    useClientSearchParam("slug") ||
    pathname?.split("/").pop() ||
    "category"
  ) /* e.g. "utilities" */
    .toLowerCase();

  const nice = prettify(slug);

  const steps = [
    {
      title: `Welcome to ${nice}`,
      body: (
        <>
          This view shows spend and transactions for the <b>{nice}</b> category.
          Each merchant card has a small <b>✏️ pencil</b> button ( Hover on
          Desktop )—click it to open the <b>Brand Manager</b> for that merchant.
        </>
      ),
    },
    {
      title: "Fix the display name & logo",
      body: (
        <>
          In Brand Manager you can set a cleaner <b>Display name</b> (e.g.,
          “Dominion Energy”) and a <b>Website domain</b> (like{" "}
          <code>dominionenergy.com</code>) to pull a logo. The preview updates
          live—then click <b>Save</b>.
        </>
      ),
    },
    {
      title: "Use an icon when a logo isn’t ideal",
      body: (
        <>
          If a logo is missing or inconsistent, toggle <b>Use icon</b> and pick
          one. We’ll show that icon everywhere this brand appears in reports.
        </>
      ),
    },
    {
      title: "Return to Categories",
      body: (
        <>
          When you are finished, click on <b> Back to Categories</b> to examine
          the main Category page
        </>
      ),
    },
  ];

  return (
    <BottomCoach
      id={`demo-category-slug-tips-v1-${slug}`}
      steps={steps}
      startOpen
    />
  );
}
