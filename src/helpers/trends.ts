/** Find the previous statement id for a given "YYYY-MM" that actually exists. */
function prevStatementId(currentId?: string | null) {
  if (!currentId) return null;
  const [y, m] = currentId.split("-").map(Number);
  if (!y || !m) return null;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const candidate = `${py.toString().padStart(4, "0")}-${pm
    .toString()
    .padStart(2, "0")}`;
  const idx = readIndex();
  return idx[candidate] ? candidate : null;
}

/** Simple MoM trend */
function computeTrend(curr: number, prev: number) {
  if (!prev && !curr) return { dir: "flat" as const, pct: 0, delta: 0 };
  if (!prev && curr) return { dir: "up" as const, pct: 100, delta: curr };
  const delta = curr - prev;
  const pct = Math.round((delta / prev) * 100);
  return delta > 0
    ? { dir: "up" as const, pct, delta }
    : delta < 0
    ? { dir: "down" as const, pct, delta }
    : { dir: "flat" as const, pct: 0, delta: 0 };
}

/** Tiny pill for trend */
function TrendPill({
  dir,
  pct,
  deltaMoney,
}: {
  dir: "up" | "down" | "flat";
  pct: number;
  deltaMoney: string;
}) {
  const up = dir === "up";
  const down = dir === "down";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border
        ${
          up
            ? "text-rose-300 border-rose-500/60 bg-rose-900/20"
            : down
            ? "text-emerald-300 border-emerald-500/60 bg-emerald-900/20"
            : "text-slate-300 border-slate-600 bg-slate-800/40"
        }`}
      title={`${deltaMoney} vs last month`}
    >
      {up ? "▲" : down ? "▼" : "–"} {Math.abs(pct)}%
    </span>
  );
}
