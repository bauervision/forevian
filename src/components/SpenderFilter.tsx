"use client";
export function SpenderFilter({
  value,
  onChange,
}: {
  value: "All" | "Mike" | "Beth";
  onChange: (v: "All" | "Mike" | "Beth") => void;
}) {
  const opt = (v: "All" | "Mike" | "Beth") => (
    <button
      key={v}
      onClick={() => onChange(v)}
      className={`px-2 py-1 rounded ${
        value === v ? "bg-cyan-600" : "bg-zinc-800 hover:bg-zinc-700"
      }`}
    >
      {v}
    </button>
  );
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="opacity-70">Spender:</span>
      {(["All", "Mike", "Beth"] as const).map(opt)}
    </div>
  );
}
