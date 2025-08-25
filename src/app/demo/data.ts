// app/demo/data.ts
import type { StatementSnapshot } from "@/lib/statements";

export const DEMO_VERSION = 2; // bump this when you change names/data

export type DemoMonth = Pick<
  StatementSnapshot,
  "id" | "label" | "stmtYear" | "stmtMonth" | "inputs" | "cachedTx"
>;

export const DEMO_MONTHS: DemoMonth[] = [
  {
    id: "2025-06",
    label: "June 2025",
    stmtYear: 2025,
    stmtMonth: 6,
    inputs: {
      beginningBalance: 1200,
      totalDeposits: 5000,
      totalWithdrawals: 2640.06,
    },
    cachedTx: [
      {
        id: "tx-dep-1",
        date: "06/01",
        description: "Payroll Direct Deposit",
        amount: +5000,
        category: "Income",
        user: "Joint",
      },
      {
        id: "tx-1",
        date: "06/02",
        description: "HARRIS TEETER #123",
        amount: -145.67,
        category: "Groceries",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-2",
        date: "06/03",
        description: "AMZN Mktp US*G4T92",
        amount: -72.34,
        category: "Amazon Marketplace",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-3",
        date: "06/05",
        description: "Dominion Energy VA",
        amount: -210.49,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-4",
        date: "06/06",
        description: "Newrez (Mortgage)",
        amount: -1895.0,
        category: "Housing",
        user: "Joint",
      },
      {
        id: "tx-5",
        date: "06/08",
        description: "Shell #334 Fuel",
        amount: -64.88,
        category: "Gas",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-6",
        date: "06/09",
        description: "Taste Unlimited",
        amount: -45.23,
        category: "Dining",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-7",
        date: "06/12",
        description: "Blue Cross Insurance",
        amount: -120.33,
        category: "Insurance",
        user: "Joint",
      },
      {
        id: "tx-8",
        date: "06/15",
        description: "Netflix.com",
        amount: -15.99,
        category: "Subscriptions",
        user: "Joint",
      },
    ],
  },
  {
    id: "2025-07",
    label: "July 2025",
    stmtYear: 2025,
    stmtMonth: 7,
    inputs: {
      beginningBalance: 1400,
      totalDeposits: 5000,
      totalWithdrawals: 2510.14,
    },
    cachedTx: [
      {
        id: "tx-dep-2",
        date: "07/01",
        description: "Payroll Direct Deposit",
        amount: +5000,
        category: "Income",
        user: "Joint",
      },
      {
        id: "tx-1b",
        date: "07/02",
        description: "HARRIS TEETER #123",
        amount: -138.77,
        category: "Groceries",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-2b",
        date: "07/03",
        description: "AMZN Mktp US*",
        amount: -82.14,
        category: "Amazon Marketplace",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-3b",
        date: "07/05",
        description: "Dominion Energy VA",
        amount: -195.88,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-4b",
        date: "07/06",
        description: "Newrez (Mortgage)",
        amount: -1895.0,
        category: "Housing",
        user: "Joint",
      },
      {
        id: "tx-5b",
        date: "07/08",
        description: "Shell #334 Fuel",
        amount: -58.41,
        category: "Gas",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-6b",
        date: "07/09",
        description: "Taste Unlimited",
        amount: -42.63,
        category: "Dining",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-7b",
        date: "07/12",
        description: "Blue Cross Insurance",
        amount: -120.33,
        category: "Insurance",
        user: "Joint",
      },
      {
        id: "tx-8b",
        date: "07/15",
        description: "Netflix.com",
        amount: -15.99,
        category: "Subscriptions",
        user: "Joint",
      },
    ],
  },
];

// If you want more depth, append more months here.
// You can also export budgets or category rules for the demo:
export const DEMO_BUDGETS = {
  period: "monthly",
  categories: {
    Housing: 1900,
    Utilities: 220,
    Groceries: 650,
    Dining: 350,
    Gas: 220,
    Subscriptions: 40,
    Insurance: 150,
    "Amazon Marketplace": 250,
  },
};
