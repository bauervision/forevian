import ClientReconciler from "@/app/reconciler/ClientReconciler";
import { Suspense } from "react";

export default function DemoReconciler() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading Dashboard…
        </div>
      }
    >
      <ClientReconciler />
    </Suspense>
  );
}
