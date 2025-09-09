// /lib/hooks/useSummaryForMonth.ts
"use client";
import * as React from "react";
import { readSummary, type Summary } from "@/lib/summaries";
import { usePathname } from "next/navigation";

export function useSummaryForMonth(
  uid?: string | null,
  monthId?: string | null
) {
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo");

  React.useEffect(() => {
    if (!uid || !monthId || isDemo) return; // don’t call Firestore on demo
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const s = await readSummary(uid, monthId);
        if (!cancelled) setSummary(s);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, monthId, isDemo]);

  return { summary, loading, error };
}
