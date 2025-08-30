export function normalizeToCanonical(name?: string): string {
  const s = (name || "").trim();
  if (!s) return "Uncategorized";

  // Exact canonical pass-through
  const canon = new Set([
    "Fast Food",
    "Dining",
    "Groceries",
    "Fuel",
    "Home/Utilities",
    "Insurance",
    "Entertainment",
    "Shopping",
    "Amazon",
    "Income/Payroll",
    "Transfer: Savings",
    "Transfer: Investing",
    "Rent/Mortgage",
    "Debt",
    "Impulse/Misc",
    "Doctors",
    "Memberships",
    "Subscriptions",
    "Cash Back",
    "Uncategorized",
  ]);
  if (canon.has(s)) return s;

  const low = s.toLowerCase();

  // Common vendor → bucket
  if (low.includes("starbucks")) return "Dining";
  if (
    low.includes("wendy") ||
    low.includes("mcdonald") ||
    low.includes("chick")
  )
    return "Fast Food";
  if (
    low.includes("amzn") ||
    low.includes("amazon marketplace") ||
    low.includes("amazon")
  )
    return "Amazon";
  if (
    low.includes("walmart") ||
    low.includes("target") ||
    low.includes("best buy") ||
    low.includes("shop")
  )
    return "Shopping";
  if (
    low.includes("prime video") ||
    low.includes("netflix") ||
    low.includes("hulu") ||
    low.includes("max") ||
    low.includes("disney") ||
    low.includes("spotify") ||
    low.includes("apple music")
  )
    return "Subscriptions";
  if (
    low.includes("rent") ||
    low.includes("mortgage") ||
    low.includes("housing")
  )
    return "Rent/Mortgage";
  if (
    low === "utilities" ||
    low === "utility" ||
    low.includes("power") ||
    low.includes("water") ||
    low.includes("internet")
  )
    return "Home/Utilities";
  if (low === "gas") return "Fuel";
  if (low === "transfers" || low === "transfer") return "Uncategorized";

  // Default fallback
  return "Uncategorized";
}
