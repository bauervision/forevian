import ClientDashboard from "@/app/dashboard/ClientDashboard";
import { Suspense } from "react";

export default function DemoDashboard() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading Dashboard…
        </div>
      }
    >
      <ClientDashboard />
    </Suspense>
  );
}
