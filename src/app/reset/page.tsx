// app/dev/reset/page.tsx
"use client";
import React from "react";

export default function DevReset() {
  const [msg, setMsg] = React.useState("");

  async function wipeAll() {
    try {
      // 1) LocalStorage (target known keys, plus a full clear for dev)
      const KEYS = [
        // your app keys (add any others you use)
        "ui.categories.v1",
        "ui.categories.backup.v1",
        "ui.brand.rules.v1",
        "reconciler.cache.v1",
        "reconciler.inputs.v1",
        "reconciler.statements.index.v2",
        "reconciler.statements.current.v2",
        // statements / overrides / rules (if you stored any of these)
        "statements.index.v1",
        "statements.currentId.v1",
        "category.overrides.v1",
        "category.rules.v1",
      ];
      KEYS.forEach((k) => localStorage.removeItem(k));
      // For dev convenience—comment out if you prefer surgical deletes only:
      localStorage.clear();

      // 2) IndexedDB: nuke Firebase caches + anything else
      // Firestore persistence
      try {
        await indexedDB.deleteDatabase("firestore/[DEFAULT]/persistent");
      } catch {}
      // Firebase Auth (local storage DB used by Firebase)
      try {
        await indexedDB.deleteDatabase("firebaseLocalStorageDb");
      } catch {}
      // Any app-specific DBs you might have created
      // await indexedDB.deleteDatabase("forevian-db"); // if you ever made one

      setMsg("Local data cleared. You can refresh or sign in as a new user.");
    } catch (e: any) {
      setMsg(`Error: ${e?.message || e}`);
    }
  }

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 p-6 bg-slate-900">
        <h1 className="text-xl font-semibold mb-3">Reset Local Data</h1>
        <p className="text-sm text-slate-300 mb-4">
          This clears LocalStorage and IndexedDB (including Firebase caches) for
          this origin.
        </p>
        <button
          onClick={wipeAll}
          className="rounded-xl px-4 py-2 bg-rose-600 text-white hover:bg-rose-700"
        >
          Wipe now
        </button>
        {msg && <div className="mt-3 text-sm text-slate-200">{msg}</div>}
      </div>
    </main>
  );
}
