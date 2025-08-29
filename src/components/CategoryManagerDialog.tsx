"use client";
import React from "react";
import {
  useCategories,
  type Category,
} from "@/app/providers/CategoriesProvider";
import IconPicker from "./IconPicker";

type Row = {
  rowId: string; // local row key
  origId?: string; // existing category id (if editing an existing one)
  name: string;
  icon?: string;
  color?: string;
  hint?: string;
};

const mkrowid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const randomNiceColor = () => {
  const palette = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#eab308",
    "#84cc16",
    "#22c55e",
    "#14b8a6",
    "#06b6d4",
    "#0ea5e9",
    "#6366f1",
    "#8b5cf6",
    "#a855f7",
    "#d946ef",
    "#ec4899",
    "#f43f5e",
    "#10b981",
    "#38bdf8",
  ];
  return palette[Math.floor(Math.random() * palette.length)];
};

export default function CategoryManagerDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded?: (cat: Category) => void;
}) {
  const { categories, setAll } = useCategories();
  const initialNamesRef = React.useRef<string[]>([]);
  const lastAddedRowIdRef = React.useRef<string | null>(null);

  const [list, setList] = React.useState<Row[]>(() =>
    categories.map((c) => ({
      rowId: mkrowid(),
      origId: c.id,
      name: c.name,
      icon: c.icon ?? "",
      color: c.color ?? randomNiceColor(),
      hint: c.hint ?? "",
    }))
  );

  React.useEffect(() => {
    if (!open) return;
    initialNamesRef.current = categories.map((c) => c.name);

    setList(
      categories.map((c) => ({
        rowId: mkrowid(),
        origId: c.id,
        name: c.name,
        icon: c.icon ?? "",
        color: c.color ?? randomNiceColor(),
        hint: c.hint ?? "",
      }))
    );
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, categories]);

  function addLocal() {
    const id = mkrowid();
    lastAddedRowIdRef.current = id;

    setList((xs) => [
      {
        rowId: id,
        name: "New Category",
        icon: "🗂️",
        color: randomNiceColor(),
        hint: "",
      },
      ...xs,
    ]);
  }

  function save() {
    // Build next Category[] while deduping by name (case-insensitive)
    const seen = new Set<string>();
    const next: Category[] = [];

    for (const r of list) {
      const name = (r.name || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      // Try to find existing cat by origId first; otherwise by name
      const existing =
        (r.origId && categories.find((c) => c.id === r.origId)) ||
        categories.find((c) => c.name.toLowerCase() === key);

      if (existing) {
        next.push({
          ...existing,
          name,
          icon: r.icon ?? existing.icon,
          color: r.color ?? existing.color,
          hint: r.hint ?? existing.hint,
          slug: slugify(name),
        });
      } else {
        next.push({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `cat-${Math.random().toString(36).slice(2)}`,
          name,
          icon: r.icon ?? "",
          color: r.color ?? randomNiceColor(),
          hint: r.hint ?? "",
          slug: slugify(name),
        });
      }
    }

    // Keep “Uncategorized” present & last
    const hasUncat = next.some((c) => c.name.toLowerCase() === "uncategorized");
    if (!hasUncat) {
      next.push({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `cat-${Math.random().toString(36).slice(2)}`,
        name: "Uncategorized",
        icon: "❓",
        color: "#475569",
        hint: "Unmapped or one-off purchases",
        slug: "uncategorized",
      });
    }

    next.sort((a, b) => {
      const ua = a.name.toLowerCase() === "uncategorized";
      const ub = b.name.toLowerCase() === "uncategorized";
      if (ua && !ub) return 1;
      if (!ua && ub) return -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    setAll(next);

    // Figure out which names are new vs the snapshot when dialog opened
    if (onAdded) {
      // 1) If user clicked ＋ Add, prefer that row
      const lastId = lastAddedRowIdRef.current;
      if (lastId) {
        const addedRow = list.find((r) => r.rowId === lastId);
        if (addedRow) {
          const pickByAdded =
            next.find(
              (c) => c.name.toLowerCase() === addedRow.name.trim().toLowerCase()
            ) || null;
          if (pickByAdded) {
            onAdded(pickByAdded);
            lastAddedRowIdRef.current = null;
            onClose();
            return;
          }
        }
      }

      // 2) Fallback: diff by name vs the snapshot you took on open
      const before = new Set(
        initialNamesRef.current.map((n) => n.toLowerCase())
      );
      const addedByName = next.filter((c) => !before.has(c.name.toLowerCase()));
      const pick =
        addedByName.find((c) => c.name.toLowerCase() !== "uncategorized") ||
        addedByName[0] ||
        null;

      if (pick) onAdded(pick);
    }

    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-[min(900px,96vw)] max-h-[90vh] overflow-auto rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-900/70 backdrop-blur px-4 py-3">
          <h3 className="text-lg font-semibold">Edit Categories</h3>
          <button
            className="text-sm rounded-xl border border-slate-700 px-3 py-1 hover:bg-slate-800"
            onClick={addLocal}
          >
            ＋ Add
          </button>
        </div>

        {/* body */}
        <div className="max-h-[62vh] overflow-auto px-4 py-3">
          {list.length === 0 && (
            <div className="text-sm text-slate-400">No categories yet.</div>
          )}
          <div className="space-y-2">
            {list.map((row, i) => {
              const isUncat = row.name.toLowerCase() === "uncategorized";
              return (
                <div
                  key={row.rowId}
                  className="grid grid-cols-12 gap-2 items-center rounded-xl border border-slate-700 bg-slate-950 px-2 py-2"
                >
                  {/* name */}
                  <input
                    className="col-span-4 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-sm placeholder-slate-500"
                    value={row.name}
                    onChange={(e) =>
                      setList((prev) =>
                        prev.map((r) =>
                          r.rowId === row.rowId
                            ? { ...r, name: e.target.value }
                            : r
                        )
                      )
                    }
                    placeholder="Name"
                    readOnly={isUncat}
                  />

                  {/* icon + picker */}
                  <div className="col-span-2 flex items-center gap-2">
                    <IconPicker
                      value={row.icon ?? ""}
                      onChange={(emoji) =>
                        setList((prev) =>
                          prev.map((r) =>
                            r.rowId === row.rowId ? { ...r, icon: emoji } : r
                          )
                        )
                      }
                    />
                  </div>
                  {/* color */}
                  <div className="col-span-3 flex items-center gap-2">
                    <input
                      type="color"
                      className="h-8 w-10 rounded border border-slate-700 bg-slate-900"
                      value={row.color || "#1f2937"}
                      onChange={(e) =>
                        setList((prev) =>
                          prev.map((r) =>
                            r.rowId === row.rowId
                              ? { ...r, color: e.target.value }
                              : r
                          )
                        )
                      }
                      title="Pick a color"
                    />
                    <input
                      className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                      value={row.color ?? ""}
                      onChange={(e) =>
                        setList((prev) =>
                          prev.map((r) =>
                            r.rowId === row.rowId
                              ? { ...r, color: e.target.value }
                              : r
                          )
                        )
                      }
                      placeholder="#hex or name"
                    />
                  </div>
                  {/* remove */}
                  <div className="col-span-1 flex items-center justify-end">
                    {!isUncat && (
                      <button
                        className="text-xs rounded-lg border border-slate-700 px-2 py-1 hover:bg-slate-800"
                        onClick={() =>
                          setList((prev) => prev.filter((x, idx) => idx !== i))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {/* hint (full row under) */}
                  <input
                    className="col-span-12 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-sm placeholder-slate-500"
                    value={row.hint ?? ""}
                    onChange={(e) =>
                      setList((prev) =>
                        prev.map((r) =>
                          r.rowId === row.rowId
                            ? { ...r, hint: e.target.value }
                            : r
                        )
                      )
                    }
                    placeholder='Hint (e.g., "YMCA, Costco" or "Netflix, Paramount+")'
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* footer */}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-slate-700 bg-slate-900/70 backdrop-blur px-4 py-3">
          <button
            className="text-sm rounded-xl border border-slate-700 px-3 py-1 hover:bg-slate-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="text-sm rounded-xl px-3 py-1 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
