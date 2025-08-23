import React from "react";

export default function WelcomeDialog({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: (remember: boolean) => void; // remember = true → don't show again
  onStart: () => void;
}) {
  const [dontShow, setDontShow] = React.useState(true);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-xl font-semibold">Welcome to Forevian</h2>
          <p className="text-sm text-slate-300 mt-1">
            We’ll get you parsing statements and reconciling in a few quick
            steps.
          </p>
        </div>

        <div className="p-5 text-sm">
          <div className="font-medium mb-2">You’ll go through:</div>
          <ol className="list-decimal pl-5 space-y-1 text-slate-300">
            <li>
              Paste one withdrawal and one deposit example to detect your
              format.
            </li>
            <li>Review the detection results and confirm the pattern.</li>
            <li>Customize your Categories and add a few simple Rules.</li>
            <li>
              Choose single-user or label card last-4s for multiple users.
            </li>
            <li>
              Review, then open the importer to load your first statement.
            </li>
          </ol>

          <div className="mt-4 flex items-center gap-2">
            <input
              id="dont-show"
              type="checkbox"
              className="rounded border-slate-600 bg-slate-900"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
            />
            <label htmlFor="dont-show" className="text-slate-300">
              Don’t show this again
            </label>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={() => onClose(dontShow)}
            className="rounded-xl border border-slate-700 px-4 py-2 hover:bg-slate-800"
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose(dontShow);
              onStart();
            }}
            className="rounded-xl px-4 py-2 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400"
          >
            Start setup
          </button>
        </div>
      </div>
    </div>
  );
}
