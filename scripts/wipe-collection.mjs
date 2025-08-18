// scripts/wipe-collection.mjs
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [, , uid] = process.argv;
if (!uid) {
  console.error("Usage: node scripts/wipe-collection.mjs <uid>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const col = db.collection("users").doc(uid).collection("transactions");
const snap = await col.get();
let i = 0,
  batch = db.batch();
for (const doc of snap.docs) {
  batch.delete(doc.ref);
  if (++i % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
await batch.commit();
console.log(`Deleted ${i} docs.`);
