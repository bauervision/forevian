"use client";
import React from "react";
import { useCategories } from "@/app/providers/CategoriesProvider";

export default function CategoryManagerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { categories, setCategories, resetDefaults } = useCategories();
  const [list, setList] = React.useState<string[]>(categories);

  React.useEffect(() => {
    if (open) setList(categories);
  }, [open, categories]);

  function add() {
    setList((prev) => ["New Category", ...prev]);
  }
  function save() {
    const normalized = Array.from(
      new Set(list.map((s) => s.trim()).filter(Boolean))
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
        <div className="p-4 border-b">
          {" "}
          <h3 className="text-lg font-semibold">Edit Categories</h3>{" "}
          <button
            className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
            onClick={add}
          >
            Add
          </button>
        </div>
        <div className="max-h-80 overflow-auto p-3">
          {list.map((name, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border-b last:border-b-0 py-2"
            >
              <input
                className="flex-1 border rounded px-2 py-1 bg-white text-gray-700
                           placeholder-gray-400 dark:bg-white dark:text-gray-700"
                value={name}
                onChange={(e) => {
                  const v = e.target.value;
                  setList((prev) => prev.map((c, idx) => (idx === i ? v : c)));
                }}
              />
              {name !== "Uncategorized" && (
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
        <div className="p-3 flex items-center justify-between gap-2 border-t">
          <div className="flex gap-2">
            <button
              className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={resetDefaults}
            >
              Reset defaults
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
