"use client";
import React from "react";
import { useCategories } from "@/app/providers/CategoriesProvider";

type CatRow = { id: string; name: string };
const mkid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export default function CategoryManagerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { categories, setCategories } = useCategories();

  const [list, setList] = React.useState<CatRow[]>(
    categories.map((c) => ({ id: mkid(), name: c }))
  );

  React.useEffect(() => {
    if (!open) return;
    setList(categories.map((c) => ({ id: mkid(), name: c })));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, categories]);

  function addLocal() {
    setList((xs) => [{ id: mkid(), name: "New Category" }, ...xs]);
  }

  function save() {
    const normalized = Array.from(
      new Set(list.map((r) => r.name.trim()).filter(Boolean))
    );
    setCategories(normalized);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-[min(740px,96vw)] max-h-[90vh] overflow-auto rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
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
            {list.map((row, i) => (
              <div
                key={row.id}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-2 py-2"
              >
                <input
                  className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-sm placeholder-slate-500"
                  value={row.name}
                  onChange={(e) =>
                    setList((prev) =>
                      prev.map((r) =>
                        r.id === row.id ? { ...r, name: e.target.value } : r
                      )
                    )
                  }
                />
                {row.name !== "Uncategorized" && (
                  <button
                    className="text-xs rounded-lg border border-slate-700 px-2 py-1 hover:bg-slate-800"
                    onClick={() =>
                      setList((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
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
