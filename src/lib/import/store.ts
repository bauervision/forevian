// lib/import/store.ts
"use client";
import { ImportProfile } from "./profile";
import {
  useAuthUID,
  userDoc,
  subscribeDoc,
  setWithRev,
  debounce,
} from "@/lib/fx";
import React from "react";

const LS_KEY = "ui.import.profile.v1";

export function loadLocalProfile(): ImportProfile | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ImportProfile) : null;
  } catch {
    return null;
  }
}
export function saveLocalProfile(p: ImportProfile) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {}
}

export function useImportProfile() {
  const uid = useAuthUID();
  const [profile, setProfile] = React.useState<ImportProfile | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    // always seed from local first (fast UX)
    const local = loadLocalProfile();
    if (local) setProfile(local);
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!uid) return; // signed-out: stick with local only
    const ref = userDoc(uid, "settings", "importProfile");
    return subscribeDoc<{ profile: ImportProfile; rev: number }>(
      ref,
      (data) => {
        if (!data?.profile) return;
        setProfile((prev) => {
          const next = data?.profile ?? null;
          const same = JSON.stringify(prev ?? null) === JSON.stringify(next);
          return same ? prev : next; // never return undefined
        });
      }
    );
  }, [uid]);

  const saveRemote = React.useMemo(
    () =>
      debounce(async (p: ImportProfile) => {
        if (!uid) return;
        const ref = userDoc(uid, "settings", "importProfile");
        await setWithRev(ref, { profile: p });
      }, 500),
    [uid]
  );

  const updateProfile = React.useCallback(
    (p: ImportProfile) => {
      saveLocalProfile(p);
      setProfile(p);
      saveRemote(p);
    },
    [saveRemote]
  );

  return { profile, updateProfile, ready };
}
