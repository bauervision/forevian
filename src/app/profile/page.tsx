"use client";

import { useAuth } from "../providers/AuthProvider";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold">Profile</h1>
      <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900 p-4">
        {user ? (
          <>
            <div className="text-sm text-slate-300">Email</div>
            <div className="font-medium">{user.email}</div>
            <button
              className="mt-4 rounded-xl px-4 py-2 border border-slate-700 hover:bg-slate-800"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </>
        ) : (
          <div className="text-slate-300">You’re not signed in.</div>
        )}
      </div>
    </main>
  );
}
