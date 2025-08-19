import { NextResponse } from "next/server";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import dayjs from "dayjs";

// IMPORTANT: This route runs on the EDGE by default in Next; Firestore client
// requires running on the client or Node runtime. Force node:
export const runtime = "nodejs";

function pretty(raw: string) {
  // Your earlier request to remove "Purchase authorized on ..."
  return raw.replace(/^Purchase authorized on \d{2}\/\d{2}\s*/i, "").trim();
}

export async function POST(req: Request) {
  try {
    // In a real app, verify Firebase session cookie/JWT. For simplicity: reject without it.
    // You can pass the uid in body if you prefer local-only seeding.
    const { uid, months = 6 } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 401 });
    }

    const txCol = collection(db, "users", uid, "transactions");
    const stmCol = collection(db, "users", uid, "statements");

    const vendors = [
      "Back Bay Bistro B Norfolk VA",
      "Amazon Marketplace",
      "Grocery Mart #102",
      "Shell Oil 12345678",
      "City Utilities",
      "Spotify",
      "Apple Services",
      "Home Improvement Ctr",
      "Local Coffee Roasters",
      "Electric Co.",
    ];

    const accountId = "checking";

    for (let m = 0; m < months; m++) {
      const monthId = dayjs().subtract(m, "month").format("YYYY-MM");

      // Skip if month exists
      const existing = await getDocs(
        query(txCol, where("statementMonth", "==", monthId))
      );
      if (!existing.empty) continue;

      // Write a statement doc (optional)
      await setDoc(
        doc(stmCol, monthId),
        { createdAt: Timestamp.now() },
        { merge: true }
      );

      // ~28–45 tx per month
      const count = 28 + Math.floor(Math.random() * 18);
      for (let i = 0; i < count; i++) {
        const date = dayjs(monthId + "-01")
          .add(Math.floor(Math.random() * 28), "day")
          .hour(12);
        const isDebit = Math.random() > 0.25;
        const vendor = vendors[Math.floor(Math.random() * vendors.length)];
        const amt = isDebit
          ? -(500 + Math.floor(Math.random() * 25000)) // -$5.00 to -$250.00
          : 10000 + Math.floor(Math.random() * 30000); // +$100 to +$300
        const id = `${monthId}-${i}-${Math.random().toString(36).slice(2, 8)}`;

        const rawDesc = `Purchase authorized on ${date.format(
          "MM/DD"
        )} ${vendor}`;
        await setDoc(doc(txCol, id), {
          date: Timestamp.fromDate(date.toDate()),
          amount: amt,
          type: isDebit ? "debit" : "credit",
          rawDesc,
          prettyDesc: pretty(rawDesc),
          categoryId: null,
          accountId,
          statementMonth: monthId,
          cleared: true,
          tags: [],
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "seed error" },
      { status: 500 }
    );
  }
}
