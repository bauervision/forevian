// lib/cashback.ts
export function parseCashBackAmount(desc: string): number | null {
  // catches: "with Cash Back $ 10.00", "with cash back $10.00", etc.
  const m = (desc || "").match(
    /with\s+cash\s*back\s*\$?\s*([0-9]+(?:\.[0-9]{2})?)/i
  );
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? +n.toFixed(2) : null;
}

export function isCashBackLine(amount: number, desc: string): boolean {
  const cb = parseCashBackAmount(desc);
  if (cb == null) return false;
  // treat exact match within 1 cent as "the cash back line"
  return Math.abs(Math.abs(amount) - cb) <= 0.01;
}
