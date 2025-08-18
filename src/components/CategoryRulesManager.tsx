"use client";
import React from "react";
import {
  readCatRules,
  writeCatRules,
  type CategoryRule,
} from "@/lib/categoryRules";

export default function CategoryRulesManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [rules, setRules] = React.useState<CategoryRule[]>([]);

  React.useEffect(() => {
    if (open) setRules(readCatRules());
  }, [open]);

  function del(idx: number) {
    const next = rules.filter((_, i) => i !== idx);
    setRules(next);
  }
  function clearAll() {
    setRules([]);
  }
  function save() {
    writeCatRules(rules);
    onClose();
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(780px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-100 shadow-xl">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Category Rules</h3>
          <div className="flex gap-2">
            <button
              className="border rounded px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto">
          {rules.length === 0 ? (
            <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
              No rules yet. Change categories in the Reconciler to create rules
              automatically.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="text-left p-2 w-40">Source</th>
                  <th className="text-left p-2">Key</th>
                  <th className="text-left p-2 w-56">Category</th>
                  <th className="p-2 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r, i) => (
                  <tr key={r.key} className="border-t">
                    <td className="p-2">{r.source}</td>
                    <td className="p-2">{r.key}</td>
                    <td className="p-2">{r.category}</td>
                    <td className="p-2 text-right">
                      <button
                        className="text-xs border rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={() => del(i)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t flex items-center justify-end gap-2">
          <button
            className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
            onClick={onClose}
          >
            Close
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
