"use client";
import React from "react";
import { useAliases, type AliasRule } from "@/app/providers/AliasesProvider";

export default function AliasManagerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { rules, setRules, addRule, removeRule } = useAliases();
  const [list, setList] = React.useState<AliasRule[]>(rules);

  React.useEffect(() => {
    if (open) setList(rules);
  }, [open, rules]);

  function save() {
    setRules(list);
    onClose();
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute left-1/2 top-1/2 w-[min(760px,95vw)] -translate-x-1/2 -translate-y-1/2
                      rounded-lg bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-100 shadow-xl"
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Merchant Aliases</h3>
          <button
            className="border rounded px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
            onClick={() =>
              setList((prev) => [
                {
                  id: crypto.randomUUID(),
                  pattern: "",
                  label: "New Merchant",
                  mode: "contains",
                },
                ...prev,
              ])
            }
          >
            Add
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-3 text-sm">
          <div className="grid grid-cols-12 gap-2 font-medium mb-1">
            <div className="col-span-5">Pattern</div>
            <div className="col-span-5">Label</div>
            <div className="col-span-2">Mode</div>
          </div>
          {list.map((r, i) => (
            <div
              key={r.id}
              className="grid grid-cols-12 gap-2 items-center border-b py-2"
            >
              <input
                className="col-span-5 border rounded px-2 py-1 bg-white dark:bg-white text-gray-700"
                value={r.pattern}
                onChange={(e) => {
                  const v = e.target.value;
                  setList((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, pattern: v } : x))
                  );
                }}
              />
              <input
                className="col-span-5 border rounded px-2 py-1 bg-white dark:bg-white text-gray-700"
                value={r.label}
                onChange={(e) => {
                  const v = e.target.value;
                  setList((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, label: v } : x))
                  );
                }}
              />
              <select
                className="col-span-2 border rounded px-2 py-1 bg-white dark:bg-white text-gray-700"
                value={r.mode}
                onChange={(e) => {
                  const v = e.target.value as AliasRule["mode"];
                  setList((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, mode: v } : x))
                  );
                }}
              >
                <option value="contains">contains</option>
                <option value="prefix">prefix</option>
                <option value="regex">regex</option>
              </select>
              <div className="col-span-12 flex justify-end">
                <button
                  className="text-xs border rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() =>
                    setList((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 flex justify-end gap-2 border-t">
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
