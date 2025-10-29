"use client";

import * as React from "react";

export default function WipeStatementDialog({
  open,
  onClose,
  onRemoveCompletely, // delete the month entirely
  onReimportFresh, // clear month and keep it selected for re-import
}: {
  open: boolean;
  onClose: () => void;
  onRemoveCompletely: () => void;
  onReimportFresh: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      {/* modal */}
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-lg font-semibold">Reset this statement?</h2>
            <p className="text-sm text-slate-400 mt-1">
              Do you want to remove this statement data completely, or simply
              re-import?
            </p>
          </div>

          <div className="p-4 space-y-3">
            <button
              type="button"
              onClick={onReimportFresh}
              className="w-full h-10 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-500"
            >
              Re-import this month (clear data but keep month)
            </button>
            <button
              type="button"
              onClick={onRemoveCompletely}
              className="w-full h-10 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-500"
            >
              Remove this month completely
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full h-10 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200"
            >
              Cancel
            </button>
          </div>

          <div className="p-3 border-t border-slate-800 text-xs text-slate-400">
            Tip: “Re-import” clears transactions/pages/inputs but leaves the
            month selected so you can run the importer again.
          </div>
        </div>
      </div>
    </div>
  );
}
