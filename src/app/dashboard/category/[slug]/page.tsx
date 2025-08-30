// app/dashboard/category/[slug]/page.tsx
import { Suspense } from "react";
import ClientCategoryPage from "./ClientCategoryPage";
import { catToSlug } from "@/lib/slug";

export const dynamicParams = false;

// Prebuild all of your default categories (matches DEFAULT_CATEGORIES)
export function generateStaticParams() {
  const GROUPS = [
    "Fast Food",
    "Dining",
    "Groceries",
    "Fuel",
    "Home/Utilities",
    "Insurance",
    "Entertainment",
    "Shopping",
    "Amazon",
    "Income/Payroll",
    "Transfer: Savings",
    "Transfer: Investing",
    "Rent/Mortgage",
    "Debt",
    "Impulse/Misc",
    "Doctors",
    "Memberships",
    "Subscriptions",
    "Cash Back",
    "Uncategorized",
  ];
  return GROUPS.map((name) => ({ slug: catToSlug(name) }));
}

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading category…
        </div>
      }
    >
      <ClientCategoryPage slug={params.slug} isDemo={false} />
    </Suspense>
  );
}
