// components/BottomCoach.tsx
"use client";

import React from "react";

export type CoachStep = {
  title: string;
  body: React.ReactNode;
};

type Props = {
  id: string;
  steps: CoachStep[];
  startOpen?: boolean;
  onClose?: () => void;
  zIndex?: number;
  widgetAfterComplete?: boolean; // show chat-head after completion (demo only)
  scopeByPath?: boolean; // track completion per pathname
};

export default function BottomCoach({
  id,
  steps,
  startOpen = true,
  onClose,
  zIndex = 60,
  widgetAfterComplete = true,
  scopeByPath = true,
}: Props) {
  // -------- Environment (set after mount; never used to conditionally add hooks)
  const [env, setEnv] = React.useState<{ isDemo: boolean; path: string }>({
    isDemo: false,
    path: "",
  });
  React.useEffect(() => {
    try {
      const path = window.location.pathname || "";
      setEnv({ isDemo: /^\/demo(?:\/|$)/.test(path), path });
    } catch {
      setEnv({ isDemo: false, path: "" });
    }
  }, []);

  // -------- Derived keys (stable even if path empty on first paint)
  const coachId = React.useMemo(
    () => id + (scopeByPath && env.path ? `@${env.path}` : ""),
    [id, scopeByPath, env.path]
  );
  const LS_DISMISSED = React.useMemo(
    () => `coach.dismissed.${coachId}`,
    [coachId]
  );
  const LS_COMPLETED = React.useMemo(
    () => `coach.completed.${coachId}`,
    [coachId]
  );
  const SS_DISMISSED = React.useMemo(
    () => `coach.session.dismissed.${coachId}`,
    [coachId]
  );
  const SS_COMPLETED = React.useMemo(
    () => `coach.session.completed.${coachId}`,
    [coachId]
  );

  // -------- UI state
  const [idx, setIdx] = React.useState(0);
  const [entered, setEntered] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [minimized, setMinimized] = React.useState(false);

  React.useEffect(() => setEntered(true), []);

  // -------- Initial visibility logic AFTER mount (prevents SSR/hydration mismatches)
  React.useEffect(() => {
    if (!steps || steps.length === 0) {
      setOpen(false);
      setMinimized(false);
      return;
    }

    try {
      if (env.isDemo) {
        const ssDismissed = sessionStorage.getItem(SS_DISMISSED) === "1";
        const ssCompleted = sessionStorage.getItem(SS_COMPLETED) === "1";
        if (ssCompleted && widgetAfterComplete) {
          setIdx(0);
          setOpen(false);
          setMinimized(true);
        } else if (ssDismissed) {
          setOpen(false);
          setMinimized(false);
        } else {
          setIdx(0);
          setOpen(true);
          setMinimized(false);
        }
      } else {
        const dismissed = localStorage.getItem(LS_DISMISSED) === "1";
        const completed = localStorage.getItem(LS_COMPLETED) === "1";
        const shouldOpen = startOpen && !dismissed && !completed;
        setOpen(!!shouldOpen);
        setMinimized(false);
      }
    } catch {
      setOpen(true);
      setMinimized(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    env.isDemo,
    LS_COMPLETED,
    LS_DISMISSED,
    SS_COMPLETED,
    SS_DISMISSED,
    widgetAfterComplete,
    startOpen,
    steps?.length,
  ]);

  // -------- Keyboard (stable; not conditional)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        // Treat ESC like "Close as Done" per your new behavior
        completeAndCollapse();
      } else if (e.key === "Enter") {
        setIdx((i) => Math.min(i + 1, Math.max(steps.length - 1, 0)));
      } else if (e.key === "Backspace") {
        setIdx((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length]); // completion function is stable via closure below

  // -------- External reopen trigger (coach:open)
  React.useEffect(() => {
    const onExtOpen = () => {
      try {
        if (env.isDemo) {
          sessionStorage.removeItem(SS_DISMISSED);
          sessionStorage.removeItem(SS_COMPLETED);
        }
      } catch {}
      setIdx(0);
      setMinimized(false);
      setOpen(true);
    };
    window.addEventListener("coach:open", onExtOpen as EventListener);
    return () =>
      window.removeEventListener("coach:open", onExtOpen as EventListener);
  }, [env.isDemo, SS_DISMISSED, SS_COMPLETED]);

  // -------- Actions
  const prev = () => setIdx((i) => Math.max(i - 1, 0));
  const next = () => setIdx((i) => (i < steps.length - 1 ? i + 1 : i));

  const completeAndCollapse = () => {
    try {
      if (env.isDemo) sessionStorage.setItem(SS_COMPLETED, "1");
      else localStorage.setItem(LS_COMPLETED, "1");
    } catch {}
    setOpen(false);
    setMinimized(env.isDemo && widgetAfterComplete);
    onClose?.();
  };

  const dontShow = () => {
    try {
      if (env.isDemo) sessionStorage.setItem(SS_DISMISSED, "1");
      else localStorage.setItem(LS_DISMISSED, "1");
    } catch {}
    setOpen(false);
    setMinimized(false);
    onClose?.();
  };

  // -------- Render: minimized chat-head (demo only)
  if (env.isDemo && minimized) {
    return (
      <button
        style={{ zIndex }}
        onClick={() => {
          setIdx(0);
          setMinimized(false);
          setOpen(true);
        }}
        className={[
          "fixed right-4 bottom-4 sm:right-6 sm:bottom-6",
          "rounded-full border border-cyan-500/60 bg-slate-900/90 backdrop-blur",
          "shadow-[0_0_0_1px_rgba(34,211,238,.25),0_18px_60px_-20px_rgba(34,211,238,.55)]",
          "px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-cyan-100",
          "hover:bg-slate-800/90 transition",
        ].join(" ")}
        aria-label="Open guide"
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
          <span>Guide</span>
        </span>
      </button>
    );
  }

  // If closed and not minimized, render nothing
  if (!open || steps.length === 0) return null;

  const safeIdx = Math.min(idx, steps.length - 1);
  const step = steps[safeIdx];
  const pct = Math.round(((safeIdx + 1) / steps.length) * 100);

  return (
    <div
      style={{ zIndex }}
      className="pointer-events-none fixed inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)]"
    >
      {/* cyan spotlight glow */}
      <div className="mx-auto max-w-3xl px-3 sm:px-4">
        <div className="pointer-events-none mx-auto h-24 w-full translate-y-6 rounded-full bg-gradient-to-t from-cyan-500/25 to-transparent blur-3xl" />
      </div>

      <div className="mx-auto max-w-3xl px-3 sm:px-4 pb-3 sm:pb-4">
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="coach-title"
          className={[
            "pointer-events-auto relative overflow-hidden",
            "rounded-2xl border shadow-2xl backdrop-blur-xl",
            "bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-800/95",
            "border-cyan-600/50 ring-1 ring-cyan-400/30",
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
                  Step {safeIdx + 1} of {steps.length}
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
              {safeIdx + 1}/{steps.length}
            </div>
          </div>

          {/* progress */}
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
                onClick={prev}
                disabled={safeIdx === 0}
                className={[
                  "text-xs px-3 py-1 rounded-lg border",
                  safeIdx === 0
                    ? "opacity-50 cursor-not-allowed border-slate-700 bg-slate-800/50 text-slate-400"
                    : "border-slate-600/70 bg-slate-800/70 text-slate-100 hover:bg-slate-800",
                ].join(" ")}
              >
                Prev
              </button>

              <button
                // Close should complete + collapse (same as Done)
                onClick={completeAndCollapse}
                className="text-xs px-3 py-1 rounded-lg border border-slate-600/70 bg-slate-800/70 text-slate-100 hover:bg-slate-800"
              >
                Close
              </button>

              <button
                onClick={() => {
                  if (safeIdx < steps.length - 1) next();
                  else completeAndCollapse();
                }}
                className="text-xs px-3 py-1 rounded-lg border border-cyan-400/70 bg-cyan-500 text-slate-900 hover:bg-cyan-400 shadow-[0_8px_22px_-10px_rgba(34,211,238,.65)]"
              >
                {safeIdx < steps.length - 1 ? "Next" : "Done"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
