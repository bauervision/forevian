"use client";
import * as React from "react";

const LS_RECENT = "ui.emoji.recent.v1";

const EMOJI_CATALOG = [
  // food/coffee
  "☕",
  "🍵",
  "🥤",
  "🍟",
  "🍔",
  "🌯",
  "🍕",
  "🥪",
  "🍰",
  // shopping / money
  "🛍️",
  "🛒",
  "💳",
  "💵",
  "🏷️",
  "🎁",
  // home / bills / utilities
  "🏠",
  "💡",
  "💧",
  "📡",
  "🧾",
  "🧰",
  // transport / fuel
  "⛽",
  "🚗",
  "🛞",
  "🅿️",
  // entertainment
  "🎬",
  "🎧",
  "🎮",
  "🎟️",
  // memberships/subs
  "🪪",
  "📺",
  "🎵",
  // transfers / finance
  "🔁",
  "📈",
  "🏦",
  "💼",
  // health
  "🩺",
  "💊",
  // insurance / protection
  "🛡️", // shield (VS16)
  "🛡", // shield (no VS16)
  // misc
  "🎲",
  "⭐",
  "🔥",
  "✅",
  "❌",
  "❓",
  // personal care / salon
  "💇‍♀️",
  "💇‍♂️",
  "✂️",
  "💈",
  "💅",
  "🧴",
];

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(LS_RECENT);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, 10) : [];
  } catch {
    return [];
  }
}
function saveRecent(list: string[]) {
  try {
    localStorage.setItem(LS_RECENT, JSON.stringify(list.slice(0, 10)));
  } catch {}
}

export default function IconPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [recent, setRecent] = React.useState<string[]>([]);

  React.useEffect(() => setRecent(loadRecent()), []);

  const filtered = React.useMemo(() => {
    if (!q.trim()) return EMOJI_CATALOG;
    // allow searching by rough words -> map a few helpers
    const dict: Record<string, string[]> = {
      coffee: ["☕", "🍵"],
      food: ["🍟", "🍔", "🍕", "🌯", "🥪", "🍰"],
      shop: ["🛍️", "🛒", "🏷️", "🎁"],
      money: ["💳", "💵", "🏦"],
      fuel: ["⛽", "🚗"],
      home: ["🏠", "💡", "💧", "📡", "🧾", "🧰"],
      sub: ["📺", "🎵", "🪪"],

      transfer: ["🔁", "📈", "🏦"],
      health: ["🩺", "💊"],
      fun: ["🎬", "🎧", "🎮", "🎟️"],
      insurance: ["🛡️", "🛡"],
      shield: ["🛡️", "🛡"],
      misc: ["🎲", "⭐", "🔥", "✅", "❌", "❓"],

      // NEW: hair/salon keywords
      hair: ["💇‍♀️", "💇‍♂️", "✂️", "💈", "🧴"],
      salon: ["💇‍♀️", "💇‍♂️", "✂️", "💅", "🧴"],
      barber: ["💈", "✂️", "💇‍♂️"],
      beauty: ["💅", "🧴", "💇‍♀️"],
      nails: ["💅"],
      spa: ["🧴", "💅"],
      grooming: ["💇‍♂️", "💇‍♀️", "✂️"],
    };
    const hits = new Set<string>();
    Object.entries(dict).forEach(([k, vals]) => {
      if (k.includes(q.toLowerCase())) vals.forEach((e) => hits.add(e));
    });
    // also allow direct emoji paste into search
    const direct = Array.from(q).filter((ch) => EMOJI_CATALOG.includes(ch));
    direct.forEach((e) => hits.add(e));
    return Array.from(hits.size ? hits : new Set(EMOJI_CATALOG));
  }, [q]);

  function pick(e: string) {
    onChange(e);
    const next = [e, ...recent.filter((x) => x !== e)];
    setRecent(next);
    saveRecent(next);
    setOpen(false);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm hover:bg-slate-800"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Pick an icon"
      >
        {value ? <span className="text-base">{value}</span> : "Pick icon"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="absolute z-50 mt-2 w-[300px] rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl"
        >
          <input
            autoFocus
            className="mb-2 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
            placeholder="Search (coffee, fuel, insurance, …) or paste emoji"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {recent.length > 0 && (
            <>
              <div className="mb-1 text-xs text-slate-400">Recent</div>
              <div className="mb-2 grid grid-cols-8 gap-1">
                {recent.map((e) => (
                  <button
                    key={`r-${e}`}
                    className="h-8 w-8 grid place-items-center rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800"
                    onClick={() => pick(e)}
                    onKeyDown={(ev) => (ev.key === "Enter" ? pick(e) : null)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="grid grid-cols-8 gap-1">
            {filtered.map((e) => (
              <button
                key={e}
                className="h-8 w-8 grid place-items-center rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800"
                onClick={() => pick(e)}
                onKeyDown={(ev) => (ev.key === "Enter" ? pick(e) : null)}
              >
                {e}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Tip: you can also paste any emoji into the search box.
            </div>
            <button
              className="text-xs rounded-lg border border-slate-700 px-2 py-1 hover:bg-slate-800"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
