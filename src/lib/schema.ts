// /lib/schema.ts
import { z } from "zod";

export const TransactionV0 = z.object({
  id: z.string(), // stable id
  date: z.string(), // MM/DD display (keep!)
  // keep an internal iso if you have it later: dateIso?: string
  description: z.string(),
  amount: z.number(), // + = deposit, - = withdrawal
  category: z.string(), // post-categorization
  raw: z.string().optional(),
  notes: z.string().optional(),
});
export type TransactionV0 = z.infer<typeof TransactionV0>;

export const LedgerSnapshotV0 = z.object({
  schemaVersion: z.literal(0),
  beginningBalance: z.number().default(0),
  transactions: z.array(TransactionV0),
});

export type LedgerSnapshotV0 = z.infer<typeof LedgerSnapshotV0>;

// “Migration” scaffold — no-ops for V0, but gives us a home later:
export function migrateToCurrent(data: unknown): LedgerSnapshotV0 {
  // In future: branch on data.schemaVersion and transform
  return LedgerSnapshotV0.parse(data);
}
