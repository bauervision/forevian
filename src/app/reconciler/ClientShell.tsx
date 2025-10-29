"use client";

import DemoSeeder from "@/helpers/reconciler/demo-seeder";
import ClientReconcilerPage from "./ClientReconciler";

export default function ClientShell() {
  // Safe: DemoSeeder no-ops off /demo
  return (
    <>
      <DemoSeeder />
      <ClientReconcilerPage />
    </>
  );
}
