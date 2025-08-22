// lib/import/profile.ts
export type DateFmt =
  | "MM/DD"
  | "M/D"
  | "MM/DD/YY"
  | "M/D/YY"
  | "MM/DD/YYYY"
  | "M/D/YYYY";

export type GroupMap = {
  date: number; // capture index (1-based) or -1 if none
  description: number;
  amount: number;
  cardLast4?: number; // optional
};

export type ImportProfile = {
  version: 1;
  unified?: boolean; // if true: use unifiedRegex for all lines
  unifiedRegex?: string;

  withdrawalRegex?: string;
  depositRegex?: string;

  groups: GroupMap; // used for unified; otherwise for withdrawal groups
  depositGroups?: GroupMap;

  dateFmt: DateFmt;
  currency?: string; // e.g., "USD" (optional)
  decimal?: "." | ","; // for EU formats if needed
  inferDebitIfNoSign?: boolean; // if amount has no sign in withdrawals

  // optional pre-cleaning
  preprocess?: {
    trimExtraSpaces?: boolean;
    stripPhoneNumbers?: boolean;
    stripLeadingTags?: string[]; // e.g., ["SPO*", "TS*"]
  };
};
