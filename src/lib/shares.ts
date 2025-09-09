// lib/shares.ts
import {
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { readSummary } from "./summaries";

export type ShareWidgets = {
  billCalendar?: boolean;
  targets?: boolean;
  availableToSpend?: boolean;
  groceriesByWeek?: boolean;
};

export type ShareDoc = {
  ownerUid: string;
  monthId: string;
  widgets: ShareWidgets;
  data: Partial<
    Pick<
      import("./summaries").Summary,
      "billCalendar" | "targets" | "availableToSpend" | "groceriesByWeek"
    >
  >;
  createdAt?: any;
  expiresAt?: any;
  disabled?: boolean;
};

export async function createShareFromSummary(
  uid: string,
  monthId: string,
  widgets: ShareWidgets
): Promise<{ id: string }> {
  const summary = await readSummary(uid, monthId);
  if (!summary) throw new Error("No summary available");

  const now = new Date();
  const expires = new Date(now);
  // one calendar month ahead (handles month rollovers)
  expires.setMonth(expires.getMonth() + 1);

  const data = {
    ownerUid: uid,
    monthId,
    widgets,
    data: {
      billCalendar: widgets.billCalendar
        ? summary.billCalendar ?? []
        : undefined,
      targets: widgets.targets ? summary.targets ?? undefined : undefined,
      availableToSpend: widgets.availableToSpend
        ? summary.availableToSpend ?? undefined
        : undefined,
      groceriesByWeek: widgets.groceriesByWeek
        ? summary.groceriesByWeek ?? []
        : undefined,
    },
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expires),
    disabled: false,
  };

  // Optional: strip undefined keys in data.data to keep it tidy
  Object.keys(data.data).forEach(
    (k) => (data.data as any)[k] === undefined && delete (data.data as any)[k]
  );

  const ref = await addDoc(collection(db, "shares"), data);
  return { id: ref.id };
}
