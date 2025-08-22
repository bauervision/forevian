// src/lib/starters.ts
import { useAuthUID } from "@/lib/fx";

export type StarterCat = {
  id: string;
  name: string;
  icon?: string;
  color?: string;
};
export type StarterRule = {
  id: string;
  pattern: string;
  categoryId: string;
  isRegex?: boolean;
};

export function readStarterCats(uid?: string | null): StarterCat[] {
  const who = uid ?? "anon";
  try {
    const raw = localStorage.getItem(`ui.import.starters.cats::${who}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readStarterRules(uid?: string | null): StarterRule[] {
  const who = uid ?? "anon";
  try {
    const raw = localStorage.getItem(`ui.import.starters.rules::${who}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markStartersApplied(uid?: string | null) {
  const who = uid ?? "anon";
  try {
    localStorage.setItem(`ui.import.starters.applied::${who}`, "1");
  } catch {}
}

export function startersAlreadyApplied(uid?: string | null) {
  const who = uid ?? "anon";
  try {
    return !!localStorage.getItem(`ui.import.starters.applied::${who}`);
  } catch {
    return false;
  }
}
