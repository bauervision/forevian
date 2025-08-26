import { Suspense } from "react";
import ClientCategories from "@/app/dashboard/category/ClientCategories";
import ClientCategoryPage from "@/app/dashboard/category/[slug]/ClientCategoryPage";

export default function Page({
  searchParams,
}: {
  searchParams?: { slug?: string };
}) {
  const hasSlug =
    typeof searchParams?.slug === "string" && searchParams.slug.length > 0;

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading…
        </div>
      }
    >
      {hasSlug ? <ClientCategoryPage /> : <ClientCategories />}
    </Suspense>
  );
}
