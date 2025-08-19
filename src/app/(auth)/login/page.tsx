"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { useRouter } from "next/navigation";

export default function Login() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === "signin")
        await signInWithEmailAndPassword(auth, email, pass);
      else await createUserWithEmailAndPassword(auth, email, pass);
      r.push("/dashboard");
    } catch (e: any) {
      setErr(e.message ?? "Auth error");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setErr(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      r.push("/dashboard");
    } catch (e: any) {
      setErr(e.message ?? "Auth error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 p-6 bg-slate-900">
        <h1 className="text-2xl font-bold mb-4">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
            placeholder="Password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            type="password"
            required
          />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button
            disabled={busy}
            className="w-full rounded-xl px-4 py-2 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400"
          >
            {busy ? "..." : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>
        <button
          onClick={google}
          className="mt-3 w-full rounded-xl px-4 py-2 border border-slate-600 hover:bg-slate-950"
        >
          Continue with Google
        </button>
        <button
          onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
          className="mt-4 text-sm text-slate-300 underline"
        >
          {mode === "signin" ? "Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
