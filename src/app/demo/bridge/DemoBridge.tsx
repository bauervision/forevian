// app/demo/bridge/DemoBridge.tsx
"use client";

import React from "react";
import { useDemoStorageBridge } from "./useDemoStorageBridge";

/** Gates children until the demo data is swapped in */
export default function DemoBridge({
  children,
}: {
  children: React.ReactNode;
}) {
  const ready = useDemoStorageBridge(); // returns true when done
  if (!ready) return null; // or a tiny skeleton if you prefer
  return <>{children}</>;
}
