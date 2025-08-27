// components/BottomCoach.tsx
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
  zIndex = 60,
}: {
  id: string;
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
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => setEntered(true), []);

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

  // If startOpen flips to true after data loads, open unless user dismissed/completed before.
  React.useEffect(() => {
    if (!startOpen) return;
    setOpen((was) => {
      if (was) return was;
      try {
        if (localStorage.getItem(LS_DISMISSED) === "1") return false;
        if (localStorage.getItem(LS_COMPLETED) === "1") return false;
      } catch {}
      return true;
    });
  }, [startOpen]);

  if (!open || steps.length === 0) return null;
  const step = steps[idx];
  const pct = Math.round(((idx + 1) / steps.length) * 100);

  const next = () => (idx < steps.length - 1 ? setIdx(idx + 1) : done());
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
      {/* cyan spotlight glow */}
      <div className="mx-auto max-w-3xl px-3 sm:px-4">
        <div
          className="pointer-events-none mx-auto h-24 w-full translate-y-6 rounded-full
                     bg-gradient-to-t from-cyan-500/25 to-transparent blur-3xl"
        />
      </div>

      <div className="mx-auto max-w-3xl px-3 sm:px-4 pb-3 sm:pb-4">
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="coach-title"
          className={[
            "pointer-events-auto relative overflow-hidden",
            "rounded-2xl border shadow-2xl backdrop-blur-xl",
            // brighter cyan card & outline
            "bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-800/95",
            "border-cyan-600/50 ring-1 ring-cyan-400/30",
            // punchy cyan glow
            "shadow-[0_0_0_1px_rgba(34,211,238,.25),0_28px_90px_-28px_rgba(34,211,238,.55),0_32px_100px_-35px_rgba(0,0,0,.9)]",
            "transition-all duration-300",
            entered
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-3 sm:translate-y-4",
            "p-3 sm:p-4",
          ].join(" ")}
        >
          {/* animated cyan edge light */}
          <div className="pointer-events-none absolute inset-0 opacity-50">
            <div className="absolute -inset-24 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-cyan-400/20 via-transparent to-transparent blur-2xl" />
          </div>

          <div className="relative flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/60 bg-cyan-900/40 px-2 py-0.5 text-[11px] font-medium text-cyan-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
                  Guide
                </span>
                <span className="text-[11px] text-slate-300">
                  Step {idx + 1} of {steps.length}
                </span>
              </div>

              <h2
                id="coach-title"
                className="mt-1 text-sm font-semibold text-white"
              >
                {step.title}
              </h2>
              <div className="mt-1.5 text-sm text-slate-50">{step.body}</div>
            </div>

            <div className="shrink-0 rounded-md border border-slate-600/80 bg-slate-800/70 px-2 py-1 text-[11px] text-slate-100">
              {idx + 1}/{steps.length}
            </div>
          </div>

          {/* cyan progress bar */}
          <div className="mt-3 h-1 w-full rounded bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded bg-gradient-to-r from-cyan-300 via-cyan-200 to-cyan-400 transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              onClick={dontShow}
              className="text-xs text-slate-300 hover:text-white underline-offset-2 hover:underline"
            >
              Don’t show again
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={close}
                className="text-xs px-3 py-1 rounded-lg border border-slate-600/70 bg-slate-800/70 text-slate-100 hover:bg-slate-800"
              >
                Close
              </button>
              <button
                onClick={next}
                className="text-xs px-3 py-1 rounded-lg border border-cyan-400/70 bg-cyan-500 text-slate-900 hover:bg-cyan-400 shadow-[0_8px_22px_-10px_rgba(34,211,238,.65)]"
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
