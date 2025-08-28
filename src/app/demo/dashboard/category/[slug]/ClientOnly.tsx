"use client";

import dynamic from "next/dynamic";

const ClientCategoryPage = dynamic(
  () => import("@/app/dashboard/category/[slug]/ClientCategoryPage"),
  { ssr: false }
);

export default function ClientOnly({ slug }: { slug: string }) {
  return <ClientCategoryPage slug={slug} isDemo />;
}
