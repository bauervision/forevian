export function normalizeToCanonical(
  name?: string,
  opts?: {
    isDemo?: boolean;
    description?: string;
    merchant?: string;
    mcc?: string | number;
  }
): string {
  const s = (name || "").trim();
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

  // 1) Pass-through of already-canonical categories
  if (s && canon.has(s)) return s;

  // 2) Build a richer "haystack" to search
  const hay = [
    s,
    opts?.description || "",
    opts?.merchant || "",
    String(opts?.mcc ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  // small helpers
  const has = (frag: string) => hay.includes(frag);
  const hasAny = (frags: string[]) => frags.some(has);

  // MCC hints (if you ever parse them)
  // 5814 = Fast Food / Quick Serve, 5812 = Restaurants
  const mcc = Number(opts?.mcc || 0);
  const mccIsFastFood = mcc === 5814;
  const mccIsDining = mcc === 5812;

  // 3) Precise vendor buckets first (strong signal)
  // Starbucks: common variants and abbreviations
  if (
    has("starbucks") ||
    has("sbux") ||
    has("sbx") ||
    has("starbucks card") ||
    has("starbucks store") ||
    has("starbucks mobile")
  ) {
    return "Starbucks";
  }

  // 4) Fast Food: broadened chain list (quick-serve only)
  const FAST_FOOD_KEYS = [
    "mcdonald",
    "mc donald",
    "burger king",
    "bk #",
    "chick-fil-a",
    "chick fil a",
    "wendy",
    "sonic",
    "taco bell",
    "kfc",
    "kentucky fried",
    "subway",
    "five guys",
    "5 guys",
    "5guys",
    "panda express",
    "arby",
    "arby's",
    "chipotle",
    "panera",
    "bojangles",
    "little caesars",
    "little caesar",
    "pizza hut",
    "domino",
    "domino's",
    "papa john",
    "popeyes",
    "jimmy john",
    "jersey mike",
    "culver",
    "culver's",
    "whataburger",
    "in-n-out",
    "in n out",
    "innout",
    "shake shack",
    "dairy queen",
    "dq ",
    "zaxby",
    "qdoba",
    "del taco",
    "el pollo loco",
    "wingstop",
    "checkers",
    "rally's",
    "rallys",
    "raising cane",
    "canes",
    "church's chicken",
    "churchs chicken",
    "freddy's",
    "freddys",
  ];
  if (mccIsFastFood || hasAny(FAST_FOOD_KEYS)) return "Fast Food";

  // 5) Dining (sit-down cues or MCC 5812). Keep it conservative.
  if (
    mccIsDining ||
    hasAny([
      "steakhouse",
      "grill",
      "cantina",
      "bistro",
      "roadhouse",
      "chophouse",
    ])
  ) {
    return "Dining";
  }

  // 6) Amazon
  if (hasAny(["amzn", "amazon marketplace", "amazon.com", "amazon"]))
    return "Amazon";

  // 7) Shopping (big box / general retail)
  if (hasAny(["walmart", "target", "best buy", "shopify", "shein", "temu"])) {
    return "Shopping";
  }

  // 8) Subscriptions / streaming / music
  if (
    hasAny([
      "prime video",
      "netflix",
      "hulu",
      "peacock",
      "discovery+",
      "max",
      "disney+",
      "disney plus",
      "spotify",
      "apple music",
      "apple tv",
      "youtube premium",
      "paramount+",
      "paramount plus",
    ])
  ) {
    return "Subscriptions";
  }

  // 9) Rent / Mortgage
  if (hasAny(["rent", "mortgage", "housing"])) return "Rent/Mortgage";

  // 10) Home/Utilities
  if (
    ["utilities", "utility"].includes(hay.trim()) ||
    hasAny([
      "power",
      "electric",
      "water",
      "sewer",
      "internet",
      "wifi",
      "cable",
      "xfinity",
      "centurylink",
      "spectrum",
      "verizon fios",
    ])
  ) {
    return "Home/Utilities";
  }

  // 11) Fuel (basic catch)
  if (
    has(" fuel") ||
    hasAny([
      "gas station",
      "chevron",
      "shell",
      "exxon",
      "bp ",
      "sunoco",
      "racetrac",
      "wawa",
      "pilot",
      "7-eleven",
      "7 eleven",
    ]) ||
    hasAny(["costco gas", "sam's fuel", "sams fuel", "costco fuel"])
  ) {
    return "Fuel";
  }

  // 12) Transfers (don’t guess direction here)
  if (hay === "transfers" || hay === "transfer") return "Uncategorized";

  // Default
  return "Uncategorized";
}
