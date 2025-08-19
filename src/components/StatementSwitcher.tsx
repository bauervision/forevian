// components/StatementSwitcher.tsx
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { readCurrentId } from "@/lib/statements"; // 👈 use saved selection

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
  const sp = useSearchParams();
  const idInUrl = sp.get("statement") ?? "";

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Build month ids (newest → oldest)
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

  // Choose the intended id (URL > saved > newest)
  const saved = mounted ? readCurrentId() : "";
  const intended = idInUrl || saved || allIds[0] || "";

  // Ensure the intended id is present in the dropdown list
  const idsForSelect = useMemo(() => {
    if (!intended) return allIds;
    return allIds.includes(intended) ? allIds : [intended, ...allIds];
  }, [allIds, intended]);

  const statements: Statement[] = useMemo(
    () =>
      idsForSelect.map((id) => ({
        id,
        label: dayjs(id + "-01").format("MMM YYYY"),
      })),
    [idsForSelect]
  );

  // If URL is empty, write the intended id once
  useEffect(() => {
    if (!mounted) return;
    if (!idInUrl && intended) {
      const next = new URLSearchParams(sp.toString());
      next.set("statement", intended);
      router.replace(`${pathname}?${next.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, idInUrl, intended]);

  const onChange = (id: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set("statement", id);
    router.replace(`${pathname}?${next.toString()}`);
  };

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
          value={idInUrl || intended || ""}
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
