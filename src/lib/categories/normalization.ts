import { canonicalizeCategoryName } from "./canon";
export function normalizeToCanonical(input?: string, _ctx?: any) {
  return canonicalizeCategoryName(input ?? "");
}
