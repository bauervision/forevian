// /lib/txEnrich.ts
export function extractCardLast4(desc: string): string {
  return desc.match(/Card\s*(\d{4})\b/i)?.[1] ?? "";
}

export function stripAuthAndCard(desc: string): string {
  // remove long auth codes like P000000379553446 / S38513524870695 and anything after
  let out = desc.replace(/\b[PS]\d{6,}\b.*$/i, "").trim();
  // remove "Card 0161" and anything after
  out = out.replace(/\bCard\s*\d{4}\b.*$/i, "").trim();
  // collapse extra spaces
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}

// Map card last4 → human
export function userFromLast4(last4: string): "Mike" | "Beth" | "Unknown" {
  if (last4 === "5280") return "Mike";
  if (last4 === "0161") return "Beth";
  return "Unknown";
}
