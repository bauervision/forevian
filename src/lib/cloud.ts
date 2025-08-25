// /lib/cloud.ts
import { db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import type { StatementSnapshot } from "./statements";
import type { CatOverrideMap } from "./overrides";
import type { AliasRule } from "@/app/providers/AliasesProvider";

export async function saveCategories(uid: string, categories: string[]) {
  try {
    await setDoc(
      doc(db, "users", uid, "prefs", "categories"),
      { categories },
      { merge: true }
    );
  } catch {}
}
export async function saveAliases(uid: string, rules: AliasRule[]) {
  try {
    await setDoc(
      doc(db, "users", uid, "prefs", "aliases"),
      { rules },
      { merge: true }
    );
  } catch {}
}
export async function saveOverrides(uid: string, map: CatOverrideMap) {
  try {
    await setDoc(
      doc(db, "users", uid, "prefs", "overrides"),
      { map },
      { merge: true }
    );
  } catch {}
}
export async function saveStatement(uid: string, s: StatementSnapshot) {
  try {
    await setDoc(doc(db, "users", uid, "statements", s.id), s, {
      merge: true,
    });
  } catch {}
}
