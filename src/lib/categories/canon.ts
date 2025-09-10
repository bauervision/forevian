// /lib/categories/canon.ts
export type CanonCategory = {
  name: string; // must be unique, human-facing
  slug: string; // kebab-case, used across UI
  icon: string;
  color: string;
  hint: string;
};

export const CANON_LIST: readonly CanonCategory[] = [
  {
    name: "Fast Food",
    slug: "fast-food",
    icon: "🍟",
    color: "#ef4444",
    hint: "McDonald’s, Chick-fil-A",
  },
  {
    name: "Dining",
    slug: "dining",
    icon: "🍽️",
    color: "#f59e0b",
    hint: "Date nights, high-end restaurants",
  },
  {
    name: "Groceries",
    slug: "groceries",
    icon: "🛒",
    color: "#22c55e",
    hint: "Harris Teeter, Kroger, Publix",
  },
  {
    name: "Fuel",
    slug: "fuel",
    icon: "⛽",
    color: "#10b981",
    hint: "Shell, BP, Exxon",
  },
  {
    name: "Home/Utilities",
    slug: "home-utilities",
    icon: "🏠",
    color: "#22c55e",
    hint: "Power, water, internet",
  },
  {
    name: "Insurance",
    slug: "insurance",
    icon: "🛡️",
    color: "#f97316",
    hint: "Health, auto, home insurance",
  },
  {
    name: "Entertainment",
    slug: "entertainment",
    icon: "🎬",
    color: "#6366f1",
    hint: "Movies, concerts",
  },
  {
    name: "Shopping",
    slug: "shopping",
    icon: "🛍️",
    color: "#06b6d4",
    hint: "Target, Best Buy, Amazon",
  },
  {
    name: "Amazon",
    slug: "amazon",
    icon: "📦",
    color: "#ff9900",
    hint: "Amazon.com orders",
  },
  {
    name: "Starbucks",
    slug: "starbucks",
    icon: "☕",
    color: "#8b5cf6",
    hint: "Coffee shops (vendor)",
  },
  {
    name: "Allowance",
    slug: "allowance",
    icon: "💸",
    color: "#22c55e",
    hint: "Kids/household allowances",
  },
  {
    name: "Vehicle/City Related",
    slug: "vehicle-city-related",
    icon: "🚗",
    color: "#38bdf8",
    hint: "Parking, tolls, vehicle fees",
  },
  {
    name: "Income/Payroll",
    slug: "income-payroll",
    icon: "💼",
    color: "#14b8a6",
    hint: "Direct deposit",
  },
  {
    name: "Transfer: Savings",
    slug: "transfer-savings",
    icon: "🔁",
    color: "#a855f7",
    hint: "Move to savings",
  },
  {
    name: "Transfer: Investing",
    slug: "transfer-investing",
    icon: "📈",
    color: "#8b5cf6",
    hint: "Brokerage / 401k",
  },
  {
    name: "Rent/Mortgage",
    slug: "rent-mortgage",
    icon: "🏡",
    color: "#84cc16",
    hint: "Housing payments",
  },
  {
    name: "Debt",
    slug: "debt",
    icon: "💳",
    color: "#f43f5e",
    hint: "Credit card / loans",
  },
  {
    name: "Impulse/Misc",
    slug: "impulse-misc",
    icon: "🎲",
    color: "#fb923c",
    hint: "Gifts, vending machines",
  },
  {
    name: "Doctors",
    slug: "doctors",
    icon: "🩺",
    color: "#38bdf8",
    hint: "Co-pays, clinics",
  },
  {
    name: "Memberships",
    slug: "memberships",
    icon: "🪪",
    color: "#22d3ee",
    hint: "YMCA, Costco, Sam’s",
  },
  {
    name: "Subscriptions",
    slug: "subscriptions",
    icon: "📺",
    color: "#e879f9",
    hint: "Netflix, Paramount+",
  },
  {
    name: "Cash Back",
    slug: "cash-back",
    icon: "💵",
    color: "#84cc16",
    hint: "ATM withdrawal, or cash back purchases",
  },
  {
    name: "Travel",
    slug: "travel",
    icon: "✈️",
    color: "#0ea5e9",
    hint: "Flights, hotels, rideshares",
  }, // NEW
  {
    name: "Uncategorized",
    slug: "uncategorized",
    icon: "❓",
    color: "#475569",
    hint: "Unmapped or one-off",
  },
] as const;

export const CANON_NAMES = new Set(CANON_LIST.map((c) => c.name));
export const CANON_BY_SLUG = Object.fromEntries(
  CANON_LIST.map((c) => [c.slug, c])
);
export const CANON_BY_NAME = Object.fromEntries(
  CANON_LIST.map((c) => [c.name, c])
);

// --- alias normalization (for user-entered labels only) ---
const tidy = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/\s*:\s*/g, ":")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();

const ALIAS_TO_CANON: Record<string, string> = {
  // Fast Food
  fastfood: "Fast Food",
  "quick service": "Fast Food",
  qsr: "Fast Food",
  takeout: "Fast Food",
  "take out": "Fast Food",
  // Dining
  "dining out": "Dining",
  restaurant: "Dining",
  restaurants: "Dining",
  "date night": "Dining",
  // Groceries
  grocery: "Groceries",
  groceries: "Groceries",
  supermarket: "Groceries",
  "super market": "Groceries",
  market: "Groceries",
  // Fuel
  gas: "Fuel",
  gasoline: "Fuel",
  petrol: "Fuel",
  // Home/Utilities
  utilities: "Home/Utilities",
  "home utilities": "Home/Utilities",
  utility: "Home/Utilities",
  power: "Home/Utilities",
  electric: "Home/Utilities",
  electricity: "Home/Utilities",
  water: "Home/Utilities",
  internet: "Home/Utilities",
  wifi: "Home/Utilities",
  cable: "Home/Utilities",
  // Insurance
  insurance: "Insurance",
  "auto insurance": "Insurance",
  "car insurance": "Insurance",
  "health insurance": "Insurance",
  "home insurance": "Insurance",
  "renters insurance": "Insurance",
  // Entertainment
  entertainment: "Entertainment",
  movies: "Entertainment",
  concerts: "Entertainment",
  tickets: "Entertainment",
  events: "Entertainment",
  gaming: "Entertainment",
  games: "Entertainment",
  // Shopping
  shopping: "Shopping",
  retail: "Shopping",
  "big box": "Shopping",
  store: "Shopping",
  stores: "Shopping",
  // Amazon (vendor bucket)
  "amazon marketplace": "Amazon",
  "amazon.com": "Amazon",
  amzn: "Amazon",
  // Starbucks (vendor bucket)
  "starbucks coffee": "Starbucks",
  "starbucks store": "Starbucks",
  sbux: "Starbucks",
  sbx: "Starbucks",
  // Allowance
  allowance: "Allowance",
  "kids allowance": "Allowance",
  "child allowance": "Allowance",
  "pocket money": "Allowance",
  // Vehicle/City Related
  vehicle: "Vehicle/City Related",
  city: "Vehicle/City Related",
  parking: "Vehicle/City Related",
  toll: "Vehicle/City Related",
  tolls: "Vehicle/City Related",
  "vehicle fees": "Vehicle/City Related",
  "traffic ticket": "Vehicle/City Related",
  // Income/Payroll
  income: "Income/Payroll",
  payroll: "Income/Payroll",
  salary: "Income/Payroll",
  wages: "Income/Payroll",
  "direct deposit": "Income/Payroll",
  // Transfer: Savings
  "transfer: savings": "Transfer: Savings",
  "transfer savings": "Transfer: Savings",
  "savings transfer": "Transfer: Savings",
  "move to savings": "Transfer: Savings",
  // Transfer: Investing
  "transfer: investing": "Transfer: Investing",
  "transfer investing": "Transfer: Investing",
  "investing transfer": "Transfer: Investing",
  "investment transfer": "Transfer: Investing",
  "brokerage transfer": "Transfer: Investing",
  "401k": "Transfer: Investing",
  // Rent/Mortgage
  rent: "Rent/Mortgage",
  mortgage: "Rent/Mortgage",
  housing: "Rent/Mortgage",
  // Debt
  debt: "Debt",
  "debt payment": "Debt",
  "loan payment": "Debt",
  "credit card payment": "Debt",
  "student loan": "Debt",
  "personal loan": "Debt",
  // Impulse/Misc
  impulse: "Impulse/Misc",
  misc: "Impulse/Misc",
  miscellaneous: "Impulse/Misc",
  "one-off": "Impulse/Misc",
  gifts: "Impulse/Misc",
  // Doctors
  doctor: "Doctors",
  doctors: "Doctors",
  medical: "Doctors",
  clinic: "Doctors",
  copay: "Doctors",
  "co-pay": "Doctors",
  healthcare: "Doctors",
  dentist: "Doctors",
  dental: "Doctors",
  // Memberships
  membership: "Memberships",
  memberships: "Memberships",
  "gym membership": "Memberships",
  "warehouse club": "Memberships",
  "costco membership": "Memberships",
  "sam's membership": "Memberships",
  "sams membership": "Memberships",
  // Subscriptions
  subscription: "Subscriptions",
  subscriptions: "Subscriptions",
  streaming: "Subscriptions",
  // Cash Back
  "cash back": "Cash Back",
  cashback: "Cash Back",
  "cash-back": "Cash Back",
  // Travel
  travel: "Travel",
  airfare: "Travel",
  airport: "Travel",
  flight: "Travel",
  flights: "Travel",
  hotel: "Travel",
  hotels: "Travel",
  lodging: "Travel",
  "car rental": "Travel",
  rideshare: "Travel",
  uber: "Travel",
  lyft: "Travel",
  "tsa precheck": "Travel",
  "tsa pre": "Travel",
  clear: "Travel",
  // Uncategorized
  uncategorized: "Uncategorized",
  uncategorised: "Uncategorized",
  other: "Uncategorized",
};

// Exported API
export function canonicalizeCategoryName(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "Uncategorized";
  if (CANON_NAMES.has(raw)) return raw;
  const key = tidy(raw);
  const mapped = ALIAS_TO_CANON[key];
  if (mapped && CANON_NAMES.has(mapped)) return mapped;

  // best-effort structured fallbacks
  if (key.startsWith("transfer:")) {
    if (key.includes("savings")) return "Transfer: Savings";
    if (key.includes("invest")) return "Transfer: Investing";
  }
  if (key.includes("amazon")) return "Amazon";
  if (key.startsWith("starbucks")) return "Starbucks";

  return "Uncategorized";
}
