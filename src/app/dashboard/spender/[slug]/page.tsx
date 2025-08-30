// app/dashboard/spender/[slug]/page.tsx
import { Suspense } from "react";
import ClientSpenderPage from "./ClientSpenderPage";

export const dynamicParams = false;

// Include the spender slugs you link to from the Dashboard
export function generateStaticParams() {
  const SPENDERS = [
    "joint",
    "you",
    "spouse",
    "primary",
    "secondary",
    // named profiles / demo aliases
    "mike",
    "beth",
    "husband",
    "wife",
  ];
  return SPENDERS.map((slug) => ({ slug }));
}

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-slate-400">
          Loading spender…
        </div>
      }
    >
      <ClientSpenderPage slug={params.slug} isDemo={false} />
    </Suspense>
  );
}
