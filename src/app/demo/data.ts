// app/demo/data.ts
import type { StatementSnapshot } from "@/lib/statements";
import type {
  Transaction,
  ReconcilerInputs,
} from "@/app/providers/ReconcilerProvider";

export const DEMO_VERSION = 7; // bump this when you change names/data

export type DemoMonth = Pick<
  StatementSnapshot,
  "id" | "label" | "stmtYear" | "stmtMonth" | "inputs" | "cachedTx"
>;

export const DEMO_MONTHS: DemoMonth[] = [
  /* ------------------------------- JUNE 2025 ------------------------------- */
  {
    id: "2025-06",
    label: "June 2025",
    stmtYear: 2025,
    stmtMonth: 6,
    inputs: {
      beginningBalance: 1200,
      totalDeposits: 5000,
      totalWithdrawals: 3656.58, // sum of negatives below
    },
    cachedTx: [
      // Deposits
      {
        id: "tx-dep-2025-06",
        date: "06/01",
        description: "Payroll Direct Deposit",
        amount: +5000,
        category: "Income",
        user: "Joint",
      },

      // Groceries / Shopping (multiple same-day)
      {
        id: "tx-ht-2025-06-02",
        date: "06/02",
        description: "HARRIS TEETER #123",
        amount: -145.67,
        category: "Groceries",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-wm1-2025-06-02",
        date: "06/02",
        description: "Walmart Supercenter",
        amount: -54.26,
        category: "Shopping",
        user: "Wife",
        cardLast4: "0161",
      },

      // Amazon + same-day Walmart.com
      {
        id: "tx-amzn-2025-06-03",
        date: "06/03",
        description: "AMZN Mktp US*G4T92",
        amount: -72.34,
        category: "Amazon Marketplace",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-wm2-2025-06-03",
        date: "06/03",
        description: "Walmart.com",
        amount: -32.81,
        category: "Shopping",
        user: "Husband",
        cardLast4: "5280",
      },

      // Utilities
      {
        id: "tx-uti-dom-2025-06-05",
        date: "06/05",
        description: "Dominion Energy VA",
        amount: -210.49,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-wm1-2025-06-05",
        date: "06/05",
        description: "Walmart Supercenter",
        amount: -176.9,
        category: "Shopping",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-uti-tmo-2025-06-18",
        date: "06/18",
        description: "T-Mobile",
        amount: -85.0,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-uti-cox-2025-06-22",
        date: "06/22",
        description: "Cox Communications",
        amount: -89.99,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-uti-vng-2025-06-25",
        date: "06/25",
        description: "Virginia Natural Gas",
        amount: -42.1,
        category: "Utilities",
        user: "Joint",
      },

      // Housing
      {
        id: "tx-housing-2025-06-06",
        date: "06/06",
        description: "Newrez (Mortgage)",
        amount: -1895.0,
        category: "Housing",
        user: "Joint",
      },

      // Gas (fuel)
      {
        id: "tx-gas-2025-06-08",
        date: "06/08",
        description: "Shell #334 Fuel",
        amount: -64.88,
        category: "Gas",
        user: "Husband",
        cardLast4: "5280",
      },

      // Dining / Fast Food (same-day)
      {
        id: "tx-dine-taste-2025-06-09",
        date: "06/09",
        description: "Taste Unlimited",
        amount: -45.23,
        category: "Dining",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-coffee-sbux-2025-06-09",
        date: "06/09",
        description: "Starbucks",
        amount: -6.75,
        category: "Dining",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-ff-wendys-2025-06-20",
        date: "06/20",
        description: "Wendy's",
        amount: -12.85,
        category: "Fast Food",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-ff-cfa-2025-06-20",
        date: "06/20",
        description: "Chick-fil-A",
        amount: -18.42,
        category: "Fast Food",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-ff-mcd-2025-06-24",
        date: "06/24",
        description: "McDonald's",
        amount: -9.5,
        category: "Fast Food",
        user: "Joint",
      },

      // Insurance
      {
        id: "tx-ins-2025-06-12",
        date: "06/12",
        description: "Blue Cross Insurance",
        amount: -120.33,
        category: "Insurance",
        user: "Joint",
      },

      // Subscriptions (many on the same day)
      {
        id: "tx-sub-nfx-2025-06-15",
        date: "06/15",
        description: "Netflix.com",
        amount: -15.99,
        category: "Subscriptions",
        user: "Joint",
      },
      {
        id: "tx-sub-disc-2025-06-15",
        date: "06/15",
        description: "Discovery+",
        amount: -6.99,
        category: "Subscriptions",
        user: "Joint",
      },
      {
        id: "tx-sub-pmtp-2025-06-15",
        date: "06/15",
        description: "Paramount+",
        amount: -11.99,
        category: "Subscriptions",
        user: "Joint",
      },
      {
        id: "tx-sub-max-2025-06-15",
        date: "06/15",
        description: "Max",
        amount: -15.99,
        category: "Subscriptions",
        user: "Joint",
      },

      // Savings & Investments (transfers)
      {
        id: "tx-savings-2025-06-28",
        date: "06/28",
        description: "Transfer to Savings",
        amount: -400.0,
        category: "Savings",
        user: "Joint",
      },
      {
        id: "tx-invest-2025-06-28",
        date: "06/28",
        description: "Brokerage Contribution",
        amount: -300.0,
        category: "Investments",
        user: "Joint",
      },
    ],
  },

  /* ------------------------------- JULY 2025 ------------------------------- */
  {
    id: "2025-07",
    label: "July 2025",
    stmtYear: 2025,
    stmtMonth: 7,
    inputs: {
      beginningBalance: 1400,
      totalDeposits: 5000,
      totalWithdrawals: 3633.46, // sum of negatives below
    },
    cachedTx: [
      // Deposit
      {
        id: "tx-dep-2025-07",
        date: "07/01",
        description: "Payroll Direct Deposit",
        amount: +5000,
        category: "Income",
        user: "Joint",
      },

      // Groceries / Shopping same-day
      {
        id: "tx-ht-2025-07-02",
        date: "07/02",
        description: "HARRIS TEETER #123",
        amount: -138.77,
        category: "Groceries",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-wm1-2025-07-02",
        date: "07/02",
        description: "Walmart Supercenter",
        amount: -62.43,
        category: "Shopping",
        user: "Husband",
        cardLast4: "5280",
      },

      // Amazon + more shopping
      {
        id: "tx-amzn-2025-07-03",
        date: "07/03",
        description: "AMZN Mktp US*",
        amount: -82.14,
        category: "Amazon Marketplace",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-wm2-2025-07-24",
        date: "07/24",
        description: "Walmart.com",
        amount: -27.65,
        category: "Shopping",
        user: "Joint",
      },

      // Utilities
      {
        id: "tx-uti-dom-2025-07-05",
        date: "07/05",
        description: "Dominion Energy VA",
        amount: -195.88,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-uti-tmo-2025-07-16",
        date: "07/16",
        description: "T-Mobile",
        amount: -85.0,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-uti-cox-2025-07-21",
        date: "07/21",
        description: "Cox Communications",
        amount: -89.99,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-uti-vng-2025-07-25",
        date: "07/25",
        description: "Virginia Natural Gas",
        amount: -38.55,
        category: "Utilities",
        user: "Joint",
      },

      // Housing
      {
        id: "tx-housing-2025-07-06",
        date: "07/06",
        description: "Newrez (Mortgage)",
        amount: -1895.0,
        category: "Housing",
        user: "Joint",
      },

      // Gas (fuel)
      {
        id: "tx-gas-2025-07-08",
        date: "07/08",
        description: "Shell #334 Fuel",
        amount: -58.41,
        category: "Gas",
        user: "Husband",
        cardLast4: "5280",
      },

      // Dining / Fast Food
      {
        id: "tx-dine-taste-2025-07-09",
        date: "07/09",
        description: "Taste Unlimited",
        amount: -42.63,
        category: "Dining",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-coffee-sbux-2025-07-09",
        date: "07/09",
        description: "Starbucks",
        amount: -7.1,
        category: "Dining",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-ff-mcd-2025-07-18",
        date: "07/18",
        description: "McDonald's",
        amount: -8.9,
        category: "Fast Food",
        user: "Joint",
      },
      {
        id: "tx-ff-wendys-2025-07-18",
        date: "07/18",
        description: "Wendy's",
        amount: -13.44,
        category: "Fast Food",
        user: "Joint",
      },
      {
        id: "tx-ff-cfa-2025-07-19",
        date: "07/19",
        description: "Chick-fil-A",
        amount: -16.28,
        category: "Fast Food",
        user: "Husband",
        cardLast4: "5280",
      },

      // Insurance
      {
        id: "tx-ins-2025-07-12",
        date: "07/12",
        description: "Blue Cross Insurance",
        amount: -120.33,
        category: "Insurance",
        user: "Joint",
      },

      // Subscriptions (cluster)
      {
        id: "tx-sub-nfx-2025-07-15",
        date: "07/15",
        description: "Netflix.com",
        amount: -15.99,
        category: "Subscriptions",
        user: "Joint",
      },
      {
        id: "tx-sub-disc-2025-07-15",
        date: "07/15",
        description: "Discovery+",
        amount: -6.99,
        category: "Subscriptions",
        user: "Joint",
      },
      {
        id: "tx-sub-pmtp-2025-07-15",
        date: "07/15",
        description: "Paramount+",
        amount: -11.99,
        category: "Subscriptions",
        user: "Joint",
      },

      // Savings & Investments
      {
        id: "tx-savings-2025-07-28",
        date: "07/28",
        description: "Transfer to Savings",
        amount: -400.0,
        category: "Savings",
        user: "Joint",
      },
      {
        id: "tx-invest-2025-07-28",
        date: "07/28",
        description: "Brokerage Contribution",
        amount: -300.0,
        category: "Investments",
        user: "Joint",
      },
    ],
  },

  /* ------------------------------ AUGUST 2025 ------------------------------ */
  {
    id: "2025-08",
    label: "August 2025",
    stmtYear: 2025,
    stmtMonth: 8,
    inputs: {
      beginningBalance: 1500,
      totalDeposits: 5000,
      totalWithdrawals: 3652.24, // sum of negatives below
    },
    cachedTx: [
      // Deposit
      {
        id: "tx-dep-2025-08",
        date: "08/01",
        description: "Payroll Direct Deposit",
        amount: +5000,
        category: "Income",
        user: "Joint",
      },

      // Groceries + same-day Walmart
      {
        id: "tx-costco-2025-08-02",
        date: "08/02",
        description: "COSTCO WHOLESALE",
        amount: -142.33,
        category: "Groceries",
        user: "Joint",
      },
      {
        id: "tx-wm1-2025-08-02",
        date: "08/02",
        description: "Walmart Supercenter",
        amount: -48.77,
        category: "Shopping",
        user: "Joint",
      },

      // Amazon + later Walmart.com
      {
        id: "tx-amzn-2025-08-03",
        date: "08/03",
        description: "AMZN Mktp US*",
        amount: -96.05,
        category: "Amazon Marketplace",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-wm2-2025-08-24",
        date: "08/24",
        description: "Walmart.com",
        amount: -35.62,
        category: "Shopping",
        user: "Wife",
        cardLast4: "0161",
      },

      // Utilities
      {
        id: "tx-uti-dom-2025-08-05",
        date: "08/05",
        description: "Dominion Energy VA",
        amount: -201.22,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-wm1-2025-08-05",
        date: "08/05",
        description: "Walmart Supercenter",
        amount: -204.23,
        category: "Shopping",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-uti-tmo-2025-08-16",
        date: "08/16",
        description: "T-Mobile",
        amount: -85.0,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-uti-cox-2025-08-21",
        date: "08/21",
        description: "Cox Communications",
        amount: -89.99,
        category: "Utilities",
        user: "Joint",
      },
      {
        id: "tx-uti-vng-2025-08-25",
        date: "08/25",
        description: "Virginia Natural Gas",
        amount: -41.75,
        category: "Utilities",
        user: "Joint",
      },

      // Housing
      {
        id: "tx-housing-2025-08-06",
        date: "08/06",
        description: "Newrez (Mortgage)",
        amount: -1895.0,
        category: "Housing",
        user: "Joint",
      },

      // Gas (fuel)
      {
        id: "tx-gas-2025-08-08",
        date: "08/08",
        description: "Shell #334 Fuel",
        amount: -61.2,
        category: "Gas",
        user: "Husband",
        cardLast4: "5280",
      },

      // Dining / Fast Food (several days)
      {
        id: "tx-dine-taste-2025-08-09",
        date: "08/09",
        description: "Taste Unlimited",
        amount: -38.17,
        category: "Dining",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-coffee-sbux-2025-08-09",
        date: "08/09",
        description: "Starbucks",
        amount: -5.95,
        category: "Dining",
        user: "Wife",
        cardLast4: "0161",
      },
      {
        id: "tx-ff-mcd-2025-08-10",
        date: "08/10",
        description: "McDonald's",
        amount: -10.25,
        category: "Fast Food",
        user: "Joint",
      },
      {
        id: "tx-ff-wendys-2025-08-18",
        date: "08/18",
        description: "Wendy's",
        amount: -12.15,
        category: "Fast Food",
        user: "Husband",
        cardLast4: "5280",
      },
      {
        id: "tx-ff-cfa-2025-08-19",
        date: "08/19",
        description: "Chick-fil-A",
        amount: -17.5,
        category: "Fast Food",
        user: "Husband",
        cardLast4: "5280",
      },

      // Insurance
      {
        id: "tx-ins-2025-08-12",
        date: "08/12",
        description: "Blue Cross Insurance",
        amount: -120.33,
        category: "Insurance",
        user: "Joint",
      },

      // Subscriptions (cluster)
      {
        id: "tx-sub-nfx-2025-08-15",
        date: "08/15",
        description: "Netflix.com",
        amount: -15.99,
        category: "Subscriptions",
        user: "Joint",
      },
      {
        id: "tx-sub-disc-2025-08-15",
        date: "08/15",
        description: "Discovery+",
        amount: -6.99,
        category: "Subscriptions",
        user: "Joint",
      },
      {
        id: "tx-sub-pmtp-2025-08-15",
        date: "08/15",
        description: "Paramount+",
        amount: -11.99,
        category: "Subscriptions",
        user: "Joint",
      },

      // Savings & Investments
      {
        id: "tx-savings-2025-08-28",
        date: "08/28",
        description: "Transfer to Savings",
        amount: -400.0,
        category: "Savings",
        user: "Joint",
      },
      {
        id: "tx-invest-2025-08-28",
        date: "08/28",
        description: "Brokerage Contribution",
        amount: -300.0,
        category: "Investments",
        user: "Joint",
      },
    ],
  },
];

// Optional: broaden budgets to showcase more categories in demo
export const DEMO_BUDGETS = {
  period: "monthly",
  categories: {
    Housing: 1900,
    Utilities: 260,
    Groceries: 700,
    "Amazon Marketplace": 300,
    Shopping: 300,
    Dining: 350,
    "Fast Food": 200,
    Gas: 220,
    Subscriptions: 60,
    Insurance: 150,
    Savings: 400, // will be "spend" toward savings transfers
    Investments: 300, // will be "spend" toward investment contributions
  },
};

// ... your existing DEMO_VERSION, DEMO_MONTHS, DEMO_BUDGETS ...

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Narrow type used for seeding into the Reconciler (structurally matches your Transaction). */
export type DemoTx = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
  categoryOverride?: string;
  cardLast4?: string;
  user?: string;
};

/** Inputs shape used by the Reconciler. */
export type DemoInputs = {
  beginningBalance?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
};

/** Always return a real DemoMonth (no "" sentinels). */
export function resolveDemoMonth(monthId?: string): DemoMonth {
  const hit = monthId ? DEMO_MONTHS.find((m) => m.id === monthId) : undefined;
  return hit ?? DEMO_MONTHS[0]; // <- never returns ""
}

// add to your exports
export function getDemoSeed(monthId?: string): {
  id: string;
  transactions: DemoTx[]; // structurally assignable to your Transaction
  inputs: DemoInputs; // structurally assignable to your ReconcilerInputs
} {
  const pick = resolveDemoMonth(monthId); // type is DemoMonth
  const transactions: DemoTx[] = Array.isArray(pick.cachedTx)
    ? (pick.cachedTx as DemoTx[])
    : [];
  const inputs: DemoInputs = {
    beginningBalance: pick.inputs?.beginningBalance ?? 0,
    totalDeposits: pick.inputs?.totalDeposits ?? 0,
    totalWithdrawals: pick.inputs?.totalWithdrawals ?? 0,
  };
  return { id: pick.id, transactions, inputs };
}
