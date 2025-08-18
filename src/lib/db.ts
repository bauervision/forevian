import { db, auth } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
} from "firebase/firestore";
import type { Tx } from "./types";

export function userRoot() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  return doc(db, "users", u.uid);
}

export function txColRef() {
  return collection(userRoot(), "transactions");
}

export async function addTx(tx: Tx) {
  const col = txColRef();
  // Normalize postDay if missing
  const d = new Date(tx.date);
  tx.postDay = tx.postDay || d.getDate();
  return addDoc(col, { ...tx, createdAt: serverTimestamp() });
}

export function onTxSnapshot(cb: (rows: Tx[]) => void) {
  const q = query(txColRef(), orderBy("date", "desc"));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as Tx[];
    cb(rows);
  });
}

// Optional: user settings (card map)
export async function ensureSettings() {
  const ref = doc(userRoot(), "settings", "default");
  await setDoc(
    ref,
    {
      cardMap: { "5280": "Mike", "0161": "Beth" },
      safetyBuffer: 500,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
