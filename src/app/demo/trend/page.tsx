// app/demo/trend/page.tsx
import { Suspense } from "react";

import ClientTrendsPage from "@/app/trends/ClientTrends";

export default function DemoTrendsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading demo trends
        </div>
      }
    >
      <ClientTrendsPage />
    </Suspense>
  );
}
