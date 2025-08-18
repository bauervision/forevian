"use client";
import React from "react";
import {
  readAliases,
  writeAliases,
  seedCommonAliases,
  learnAliasesFromTransactions,
  type AliasRule,
} from "@/lib/aliases";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";

export default function AliasManagerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { transactions } = useReconcilerSelectors();
  const [list, setList] = React.useState<AliasRule[]>([]);

  React.useEffect(() => {
    if (open) setList(readAliases());
  }, [open]);

  function addRow() {
    setList((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2, 9),
        pattern: "",
        label: "",
        mode: "contains",
      },
    ]);
  }
  function save() {
    writeAliases(list);
    onClose();
  }
  function seed() {
    setList(seedCommonAliases());
  }
  function learn() {
    setList(learnAliasesFromTransactions(transactions));
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(840px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-100 shadow-xl">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Manage Aliases</h3>
          <div className="flex gap-2">
            <button
              className="border rounded px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={seed}
            >
              Seed common aliases
            </button>
            <button
              className="border rounded px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={learn}
            >
              Learn from this statement
            </button>
            <button
              className="border rounded px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={addRow}
            >
              Add
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto divide-y">
          {list.length === 0 ? (
            <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
              No aliases yet. Use <em>Seed common aliases</em> to prefill, or{" "}
              <em>Learn from this statement</em>.
            </div>
          ) : (
            list.map((r, i) => (
              <div
                key={r.id}
                className="p-3 grid grid-cols-12 gap-2 items-center"
              >
                <select
                  className="col-span-2 border rounded px-2 py-1 bg-white dark:bg-white text-gray-700"
                  value={r.mode}
                  onChange={(e) =>
                    setList((prev) =>
                      prev.map((x, idx) =>
                        idx === i ? { ...x, mode: e.target.value as any } : x
                      )
                    )
                  }
                >
                  <option value="contains">contains</option>
                  <option value="startsWith">starts with</option>
                  <option value="regex">regex</option>
                </select>
                <input
                  className="col-span-5 border rounded px-2 py-1 bg-white dark:bg-white text-gray-700 placeholder-gray-400"
                  placeholder="pattern (e.g., harris te)"
                  value={r.pattern}
                  onChange={(e) =>
                    setList((prev) =>
                      prev.map((x, idx) =>
                        idx === i
                          ? { ...x, pattern: e.target.value.toLowerCase() }
                          : x
                      )
                    )
                  }
                />
                <input
                  className="col-span-4 border rounded px-2 py-1 bg-white dark:bg-white text-gray-700 placeholder-gray-400"
                  placeholder="label (e.g., Harris Teeter)"
                  value={r.label}
                  onChange={(e) =>
                    setList((prev) =>
                      prev.map((x, idx) =>
                        idx === i ? { ...x, label: e.target.value } : x
                      )
                    )
                  }
                />
                <button
                  className="col-span-1 text-xs border rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() =>
                    setList((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t flex items-center justify-end gap-2">
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
  );
}
