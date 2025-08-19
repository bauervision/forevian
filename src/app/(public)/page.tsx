import Link from "next/link";

export default function Landing() {
  return (
    <main className="min-h-[80vh] flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
        Forevian<span className="text-cyan-400"> Finance</span>
      </h1>
      <p className="mt-4 max-w-2xl text-slate-300">
        Parse statements, auto-clean descriptions, categorize, and
        reconcile—fast.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link
          href="/login"
          className="rounded-xl px-5 py-3 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400"
        >
          Sign in
        </Link>
        <Link
          href="/demo"
          className="rounded-xl px-5 py-3 border border-slate-600 hover:bg-slate-900/50"
        >
          View Demo
        </Link>
      </div>

      {/* optional demo KPIs */}
      <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl">
        {["6 mo history", "10.8k expenses", "7 recurring", "99.7% parsed"].map(
          (k, i) => (
            <div key={i} className="rounded-2xl border border-slate-700 p-4">
              <div className="text-lg font-semibold">{k}</div>
            </div>
          )
        )}
      </div>
    </main>
  );
}
