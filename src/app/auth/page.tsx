"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [user, setUser] = useState<any>(null);

  // subscribe once (simple inline effect)
  useState(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  });

  const signup = async () =>
    await createUserWithEmailAndPassword(auth, email, pass);
  const signin = async () =>
    await signInWithEmailAndPassword(auth, email, pass);
  const signout = async () => await signOut(auth);

  return (
    <main className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Forevian — Auth Test</h1>

      {user ? (
        <div className="space-y-3">
          <div className="text-sm opacity-80">Signed in as {user.email}</div>
          <button
            onClick={signout}
            className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
            placeholder="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={signup}
              className="px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-700"
            >
              Sign up
            </button>
            <button
              onClick={signin}
              className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
            >
              Sign in
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
