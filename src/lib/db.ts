import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  Timestamp,
} from "firebase/firestore";

export type Tx = {
  id: string;
  date: Timestamp;
  amount: number; // cents +/-
  type: "debit" | "credit";
  rawDesc: string;
  prettyDesc: string;
  categoryId?: string | null;
  accountId: string;
  statementMonth: string; // "YYYY-MM"
  cleared?: boolean;
  tags?: string[];
};

export async function listStatements(uid: string): Promise<string[]> {
  const col = collection(db, "users", uid, "statements");
  const snap = await getDocs(col);
  const months: string[] = [];
  snap.forEach((d) => months.push(d.id));
  return months.sort().reverse();
}

export async function getTransactionsByStatement(
  uid: string,
  statement: string
) {
  const col = collection(db, "users", uid, "transactions");
  const q = query(
    col,
    where("statementMonth", "==", statement),
    orderBy("date", "desc"),
    limit(1000)
  );
  const snap = await getDocs(q);
  const rows: Tx[] = [];
  snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
  return rows;
}

export async function upsertCategory(
  uid: string,
  id: string,
  payload: { name: string; color?: string; icon?: string }
) {
  await setDoc(doc(db, "users", uid, "categories", id), payload, {
    merge: true,
  });
}
