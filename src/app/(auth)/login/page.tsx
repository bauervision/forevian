"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { useImportProfile } from "@/lib/import/store";

export default function Login() {
  const { profile } = useImportProfile();
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Check redirect result once (covers mobile / popup-blocked cases)
  // Optional: you could move this to a useEffect; keeping inline here for brevity.
  const handlePostAuthRedirect = () => {
    if (!profile) r.push("/onboarding");
    else r.push("/dashboard");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, pass);
      } else {
        await createUserWithEmailAndPassword(auth, email, pass);
      }
      handlePostAuthRedirect();
    } catch (e: any) {
      setErr(friendlyAuthMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setErr(null);
    const provider = new GoogleAuthProvider();
    try {
      // Try popup first
      await signInWithPopup(auth, provider);
      handlePostAuthRedirect();
    } catch (ePopup: any) {
      // Fallback to redirect if popup blocked or COOP/extension issues
      try {
        await signInWithRedirect(auth, provider);
        // After the redirect back, Firebase will complete and we can route.
        // In practice, the page reloads; add this for safety if the environment doesn’t reload:
        const res = await getRedirectResult(auth);
        if (res?.user) handlePostAuthRedirect();
      } catch (eRedirect: any) {
        setErr(friendlyAuthMessage(eRedirect));
      }
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
            autoComplete="email"
          />
          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
            placeholder="Password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            type="password"
            required
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
          />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button
            disabled={busy}
            className="w-full rounded-xl px-4 py-2 bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400 disabled:opacity-60"
          >
            {busy ? "..." : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          onClick={google}
          disabled={busy}
          className="mt-3 w-full rounded-xl px-4 py-2 border border-slate-600 hover:bg-slate-950 disabled:opacity-60"
        >
          Continue with Google
        </button>

        <button
          onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
          disabled={busy}
          className="mt-4 text-sm text-slate-300 underline"
        >
          {mode === "signin" ? "Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}

function friendlyAuthMessage(e: any): string {
  const code = e?.code || "";
  switch (code) {
    case "auth/unauthorized-domain":
      return "This domain isn’t authorized for sign-in. Add it in Firebase → Auth → Settings → Authorized domains.";
    case "auth/popup-closed-by-user":
      return "Popup closed before completing sign-in. Try again, or use the Google button again.";
    case "auth/cancelled-popup-request":
      return "Another sign-in is already in progress. Please try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return e?.message ?? "Authentication error. Please try again.";
  }
}
