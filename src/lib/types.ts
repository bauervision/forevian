export type Direction = "INCOME" | "EXPENSE";
export type Category =
  | "Groceries"
  | "Dining"
  | "Utilities"
  | "Gas"
  | "Housing"
  | "Debt"
  | "Insurance"
  | "Subscriptions"
  | "Healthcare"
  | "Kids/School"
  | "Entertainment"
  | "Shopping/Household"
  | "Amazon"
  | "Impulse/Misc"
  | "Transfers"
  | "Cash";

export type Tx = {
  id?: string;
  date: string; // ISO
  postDay: number; // 1..31
  description: string;
  amount: number; // +income, -expense
  category: Category;
  subcategory?: "Gifts" | "Groceries" | "Supplements" | "Other";
  merchant?: string;
  channel?: "card" | "ach" | "billpay" | "cash";
  cardLast4?: "5280" | "0161" | string;
  spender?: "Mike" | "Beth" | "Unknown";
  isRecurring?: boolean;
  recurrenceKey?: string;
  accountId: string; // e.g., 'wells-checking'
};

export type ParsedLine = {
  dateIso?: string;
  dateDisplay: string;
  description: string;
  amount: number;
  tag?: "cb_cashback" | "card_purchase" | "deposit" | "billpay";
  parseNotes: string[];
};

export type TxRow = {
  running?: number;
  id: string;
  date: string;
  description: string;
  amount: number;
  raw?: string;
  notes?: string;
  category?: string;
  categoryOverride?: string;
  cardLast4?: string;
  user?: string;
  parseWarnings?: string[];
};
