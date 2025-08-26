"use client";

import React from "react";

export type CoachStep = {
  title: string;
  body: React.ReactNode;
};

export default function BottomCoach({
  id,
  steps,
  startOpen = true,
  onClose,
  zIndex = 60, // sits above app chrome but under modals if you want
}: {
  id: string; // unique key, e.g. "demo-reconciler-v1"
  steps: CoachStep[];
  startOpen?: boolean;
  onClose?: () => void;
  zIndex?: number;
}) {
  const LS_DISMISSED = `coach.dismissed.${id}`;
  const LS_COMPLETED = `coach.completed.${id}`;

  const [open, setOpen] = React.useState<boolean>(() => {
    if (!startOpen) return false;
    try {
      if (localStorage.getItem(LS_DISMISSED) === "1") return false;
      return localStorage.getItem(LS_COMPLETED) !== "1";
    } catch {
      return true;
    }
  });
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        try {
          localStorage.setItem(LS_DISMISSED, "1");
        } catch {}
        setOpen(false);
        onClose?.();
      } else if (e.key === "Enter") {
        setIdx((i) => Math.min(i + 1, steps.length - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length, onClose]);

  if (!open || steps.length === 0) return null;
  const step = steps[idx];

  const next = () => {
    if (idx < steps.length - 1) setIdx(idx + 1);
    else done();
  };

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const dontShow = () => {
    try {
      localStorage.setItem(LS_DISMISSED, "1");
    } catch {}
    close();
  };

  const done = () => {
    try {
      localStorage.setItem(LS_COMPLETED, "1");
    } catch {}
    close();
  };

  return (
    <div
      style={{ zIndex }}
      className="pointer-events-none fixed inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto max-w-3xl px-3 sm:px-4 pb-3 sm:pb-4">
        <div
          className="pointer-events-auto rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur
                     p-3 sm:p-4"
          role="dialog"
          aria-modal="false"
          aria-labelledby="coach-title"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div
                id="coach-title"
                className="text-sm font-semibold text-white"
              >
                {step.title}
              </div>
              <div className="mt-1 text-sm text-slate-200">{step.body}</div>
            </div>

            {/* step indicator */}
            <div className="shrink-0 text-[11px] text-slate-400 mt-0.5">
              {idx + 1}/{steps.length}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              onClick={dontShow}
              className="text-xs text-slate-300 hover:text-white"
            >
              Don’t show again
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={close}
                className="text-xs px-3 py-1 rounded-lg border border-slate-700 hover:bg-slate-800"
              >
                Close
              </button>
              <button
                onClick={next}
                className="text-xs px-3 py-1 rounded-lg border border-emerald-500/60 bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {idx < steps.length - 1 ? "Next" : "Done"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
