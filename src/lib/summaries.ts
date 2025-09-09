// /lib/summaries.ts
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type Summary = {
  monthId: string;
  currency: "USD";
  totals: { deposits: number; withdrawals: number; endingBalance: number };
  spendByCategory: Record<string, number>;
  targets?: { monthly: number; saved: number; remaining: number };
  availableToSpend?: number;
  groceriesByWeek?: { weekStartISO: string; amount: number }[];
  billCalendar?: {
    day: number;
    name: string;
    amount: number;
    status: "upcoming" | "paid";
  }[];
  source: "reconciled" | "imported";
  updatedAt?: any;
};

export async function writeSummary(uid: string, monthId: string, s: Summary) {
  const ref = doc(db, `users/${uid}/summaries/${monthId}`);
  await setDoc(ref, { ...s, updatedAt: serverTimestamp() });
}

export async function readSummary(
  uid: string,
  monthId: string
): Promise<Summary | null> {
  const ref = doc(db, `users/${uid}/summaries/${monthId}`);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as Summary) : null;
}
