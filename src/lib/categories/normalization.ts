export function normalizeToCanonical(
  name?: string,
  opts?: { isDemo?: boolean }
): string {
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
    "Starbucks",
    "Allowance",
    "Vehicle/City Related",
  ]);
  if (canon.has(s)) return s;

  const low = s.toLowerCase();
  const isDemo = !!opts?.isDemo;

  if (low.includes("starbucks")) return "Starbucks";

  // Common vendor → bucket
  if (
    low.includes("lone star") ||
    low.includes("cracker barrell") ||
    low.includes("texas roadhouse")
  )
    return "Dining";
  if (
    low.includes("zaxby") ||
    low.includes("taco bell") ||
    low.includes("dairy queen") ||
    low.includes("cava") ||
    low.includes("taste") ||
    low.includes("pizza hut") ||
    low.includes("dominos") ||
    low.includes("papa john") ||
    low.includes("burger king") ||
    low.includes("hardee") ||
    low.includes("wendy") ||
    low.includes("sonic drive") ||
    low.includes("5guys") ||
    low.includes("mcdonald") ||
    low.includes("chick-fil-a")
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
    low.includes("peacock") ||
    low.includes("discovery+") ||
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
