// src/lib/fx.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  FirestoreError,
  DocumentReference,
} from "firebase/firestore";

export function useAuthUID() {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(
    () => onAuthStateChanged(auth, (u: User | null) => setUid(u?.uid ?? null)),
    []
  );
  return uid;
}

export const userDoc = (uid: string, ...parts: string[]) =>
  doc(db, "users", uid, ...parts);

// basic debounce to avoid thrashing Firestore on every keystroke
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  wait = 300
) {
  let t: any;
  const d = (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  d.cancel = () => clearTimeout(t);
  return d as T & { cancel: () => void };
}

/**
 * Transactional "set with auto-rev":
 * reads current rev, increments, and writes {rev, updatedAt, ...payload}
 */
export async function setWithRev<T extends object>(
  ref: DocumentReference,
  payload: T
) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const nextRev = (snap.exists() ? (snap.data() as any).rev ?? 0 : 0) + 1;
    tx.set(
      ref,
      {
        ...payload,
        rev: nextRev,
        updatedAt: serverTimestamp(),
      } as any,
      { merge: true }
    );
  });
}

/**
 * One-way subscription that feeds remote → local setter.
 * Returns unsubscribe function (same signature as onSnapshot).
 */
export function subscribeDoc<T extends object>(
  ref: DocumentReference,
  onRemote: (data: (Partial<T> & { rev?: number }) | null) => void
) {
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return onRemote(null);
      onRemote(snap.data() as any);
    },
    (err: FirestoreError) => {
      console.error("[Firestore subscribe error]", err);
    }
  );
}
