import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [, , uid] = process.argv;
if (!uid) {
  console.error("Usage: node scripts/fix-recurring.mjs <uid>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const ALLOW_RECUR_CATS = new Set([
  "Housing",
  "Utilities",
  "Insurance",
  "Subscriptions",
  "Debt",
  "Transfers",
  "Kids/School",
]);
const EXCLUDE_MERCH = new Set([
  "Chase Credit Card Payment",
  "Capital One Credit Card Payment",
]);

const col = db.collection("users").doc(uid).collection("transactions");
const snap = await col.get();

let i = 0,
  batch = db.batch();
for (const doc of snap.docs) {
  const t = doc.data();
  const cat = t.category || "";
  const merch = t.merchant || "";
  const cashback = Number(t.cashback || 0);
  const desc = String(t.description || "");

  // base rule
  let isRecurring = ALLOW_RECUR_CATS.has(cat) && cashback <= 0;
  // blocklist
  if (EXCLUDE_MERCH.has(merch)) isRecurring = false;
  // card swipes for retail (don’t set)
  if (/Card\s*\d{4}/i.test(desc) && !ALLOW_RECUR_CATS.has(cat))
    isRecurring = false;

  batch.update(doc.ref, { isRecurring });
  if (++i % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
await batch.commit();
console.log(`Updated ${i} docs.`);
