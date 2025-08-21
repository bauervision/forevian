"use client";
import React from "react";
import { useCategories } from "@/app/providers/CategoriesProvider";

type CatRow = { id: string; name: string };

function makeId() {
  // crypto.randomUUID is fine in modern browsers; fall back for SSR/older
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export default function CategoryManagerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    categories,
    setCategories,
    addCategory,
    resetDefaults,
    recoverFromData,
    restoreBackup,
  } = useCategories();

  const [list, setList] = React.useState<CatRow[]>(
    categories.map((c) => ({ id: makeId(), name: c }))
  );

  React.useEffect(() => {
    if (open) {
      setList(categories.map((c) => ({ id: makeId(), name: c })));
    }
  }, [open, categories]);

  function addLocal() {
    setList((prev) => [{ id: makeId(), name: "New Category" }, ...prev]);
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
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute left-1/2 top-1/2 w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2
          rounded-lg bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-100 shadow-xl"
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Categories</h3>
          <div className="flex gap-2">
            <button
              className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={addLocal}
            >
              Add
            </button>
            <button
              className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => {
                // add via provider too (keeps provider state consistent if you save immediately)
                addCategory("New Category");
                setList((prev) => [
                  { id: makeId(), name: "New Category" },
                  ...prev,
                ]);
              }}
              title="Add (provider)"
              style={{ display: "none" }}
            >
              Add (prov)
            </button>
          </div>
        </div>

        <div className="max-h-80 overflow-auto p-3">
          {list.map((row, i) => (
            <div
              key={row.id}
              className="flex items-center gap-2 border-b last:border-b-0 py-2"
            >
              <input
                className="flex-1 border rounded px-2 py-1 bg-white text-gray-700
                  placeholder-gray-400 dark:bg-white dark:text-gray-700"
                value={row.name}
                onChange={(e) => {
                  const v = e.target.value;
                  setList((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, name: v } : r))
                  );
                }}
              />
              {row.name !== "Uncategorized" && (
                <button
                  className="text-xs border rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
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

        <div className="p-3 flex flex-wrap items-center justify-between gap-2 border-t">
          <div className="flex flex-wrap gap-2">
            <button
              className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => {
                // Merge defaults with current and re-open at top
                const merged = Array.from(
                  new Set([
                    "Uncategorized",
                    ...list.map((r) => r.name),
                    ...DEFAULTS,
                  ])
                ).map((name) => ({ id: makeId(), name }));
                setList(merged);
              }}
              title="Merge defaults"
            >
              Merge defaults
            </button>
            <button
              className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={resetDefaults}
              title="Reset to defaults"
            >
              Reset defaults
            </button>
            <button
              className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={recoverFromData}
              title="Recover by scanning rules + cached transactions"
            >
              Recover from data
            </button>
            <button
              className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={restoreBackup}
              title="Restore the last saved copy"
            >
              Restore backup
            </button>
          </div>

          <div className="flex gap-2">
            <button
              className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="rounded px-3 py-1 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={save}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Keep dialog-local DEFAULTS to avoid import cycles
const DEFAULTS = [
  "Uncategorized",
  "Income",
  "Transfers",
  "Debt",
  "Cash Back",
  "Utilities",
  "Housing",
  "Insurance",
  "Subscriptions",
  "Groceries",
  "Dining",
  "Fast Food",
  "Gas",
  "Shopping/Household",
  "Entertainment",
  "Kids/School",
  "Amazon",
  "Starbucks",
];
