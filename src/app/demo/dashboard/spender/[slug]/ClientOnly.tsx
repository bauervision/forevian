"use client";

import dynamic from "next/dynamic";

// Load the client page only on the client.
const ClientSpenderPage = dynamic(
  () => import("@/app/dashboard/spender/[slug]/ClientSpenderPage"),
  { ssr: false }
);

export default function ClientOnly({ slug }: { slug: string }) {
  // We’re in /demo, so tell the client page it’s demo mode.
  return <ClientSpenderPage slug={slug} isDemo />;
}
