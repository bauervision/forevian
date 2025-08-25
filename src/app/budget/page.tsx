// app/reconciler/page.tsx
import { Suspense } from "react";
import ClientBudgetPage from "./ClientBudget";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading budget...
        </div>
      }
    >
      <ClientBudgetPage />
    </Suspense>
  );
}
