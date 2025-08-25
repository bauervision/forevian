// app/reconciler/page.tsx
import { Suspense } from "react";

import ClientTrendsPage from "./ClientTrends";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading trends…
        </div>
      }
    >
      <ClientTrendsPage />
    </Suspense>
  );
}
