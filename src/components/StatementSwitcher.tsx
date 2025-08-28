"use client";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { readCurrentId, writeCurrentId } from "@/lib/statements";
import { useSelectedStatementId } from "@/lib/useClientSearchParams";

type Statement = { id: string; label: string };

export default function StatementSwitcher({
  available,
  fallbackMonths = 6,
  label = "Statement",
  showLabel = true,
  size = "md",
  className = "",
}: {
  available?: string[];
  fallbackMonths?: number;
  label?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;

  // URL source of truth (non-demo)
  const idFromUrl = useSelectedStatementId(); // string | null

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Build candidate ids (newest → oldest)
  const allIds = useMemo(() => {
    const base = (
      available?.length
        ? Array.from(new Set(available))
        : Array.from({ length: fallbackMonths }, (_, i) =>
            dayjs().startOf("month").subtract(i, "month").format("YYYY-MM")
          )
    ).sort((a, b) => (a > b ? -1 : 1));
    return base;
  }, [available, fallbackMonths]);

  // Local selected state so demo routes can update instantly
  const [selected, setSelected] = useState<string>("");

  // Initialize & keep in sync with URL/localStorage
  useEffect(() => {
    if (!mounted) return;

    const saved = readCurrentId() || "";
    const fallback = allIds[0] || "";
    const next = (idFromUrl || saved || fallback || "").trim();

    if (next && next !== selected) setSelected(next);

    // Always persist to LS so the rest of the app can read it
    if (next && next !== saved) writeCurrentId(next);

    // If URL is empty on non-demo, mirror the chosen id once
    if (!isDemo && !idFromUrl && next && typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("statement", next);
      router.replace(u.pathname + "?" + u.searchParams.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, idFromUrl, allIds, isDemo, router]);

  // Ensure the currently selected id is present in the dropdown list
  const idsForSelect = useMemo(() => {
    if (!selected) return allIds;
    return allIds.includes(selected) ? allIds : [selected, ...allIds];
  }, [allIds, selected]);

  const statements: Statement[] = useMemo(
    () =>
      idsForSelect.map((id) => ({
        id,
        label: dayjs(id + "-01").format("MMM YYYY"),
      })),
    [idsForSelect]
  );

  const onChange = useCallback(
    (id: string) => {
      setSelected(id);
      writeCurrentId(id);

      // Non-demo: reflect in URL so other pages pick it up
      if (!isDemo && typeof window !== "undefined") {
        const u = new URL(window.location.href);
        u.searchParams.set("statement", id);
        router.replace(u.pathname + "?" + u.searchParams.toString());
      }
    },
    [isDemo, router]
  );

  const h = size === "sm" ? "h-9 text-sm" : "h-10";
  const wrapperW = className || "sm:w-56";

  return (
    <div className={`w-full ${wrapperW}`} suppressHydrationWarning>
      {showLabel && (
        <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          aria-label={label}
          value={selected || ""}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full ${h} rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 pr-9
                      focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500`}
        >
          {statements.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-70"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.086l3.71-3.854a.75.75 0 111.08 1.04l-4.24 4.4a.75.75 0 01-1.08 0l-4.24-4.4a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </div>
  );
}
