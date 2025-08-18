// scripts/seed-firestore.mjs
import fs from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const [, , jsonPath, uid] = process.argv;
if (!jsonPath || !uid) {
  console.error(
    "Usage: node scripts/seed-firestore.mjs <path/to/transactions.json> <uid>"
  );
  process.exit(1);
}

const raw = fs.readFileSync(jsonPath, "utf8");
const data = JSON.parse(raw);
if (!Array.isArray(data)) {
  console.error("JSON must be an array of transactions");
  process.exit(1);
}

const col = db.collection("users").doc(uid).collection("transactions");
const CHUNK = 450;

for (let i = 0; i < data.length; i += CHUNK) {
  const batch = db.batch();
  for (const tx of data.slice(i, i + CHUNK)) {
    const d = new Date(tx.date);
    const doc = col.doc();
    batch.set(doc, {
      ...tx,
      postDay: tx.postDay ?? (isNaN(d.getTime()) ? null : d.getDate()),
      createdAt: new Date(),
    });
  }
  await batch.commit();
  console.log(`Wrote ${Math.min(CHUNK, data.length - i)} docs…`);
}
console.log("Seed complete.");
