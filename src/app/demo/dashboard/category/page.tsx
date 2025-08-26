import ClientCategoryPage from "@/app/dashboard/category/[slug]/ClientCategoryPage";
import ClientCategories from "@/app/dashboard/category/ClientCategories";
import { Suspense } from "react";

export default function DemoCategory() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading Dashboard…
        </div>
      }
    >
      <ClientCategories />
    </Suspense>
  );
}

export function DemoCategoryShim() {
  // ClientCategoryPage will read slug from search params when there's no route param.
  return <ClientCategoryPage />;
}
