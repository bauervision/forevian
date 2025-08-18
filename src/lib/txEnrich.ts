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

// Clean, human-friendly description for UI lists/tables.
// Clean, human-friendly description for UI lists/tables.
export function prettyDesc(raw: string): string {
  return (
    (raw || "")
      // drop leading posting date like "06/26 "
      .replace(/^\s*\d{1,2}\/\d{1,2}\s+/, "")
      // drop "Purchase authorized on MM/DD" or "Recurring Payment authorized on MM/DD" at the start
      .replace(
        /^\s*(?:purchase|recurring\s+payment)\s+authorized\s+on\s+\d{1,2}\/\d{1,2}\s*/i,
        ""
      )
      // also drop a bare leading "Purchase " that some statements leave behind
      .replace(/^\s*purchase\s+/i, "")
      // drop trailing "Card 1234 ..." and any auth codes that often follow
      .replace(/\bcard\s*\d{4}\b.*$/i, "")
      .replace(/\b[sp]\d{6,}\b.*$/i, "")
      // collapse leftover whitespace
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}
