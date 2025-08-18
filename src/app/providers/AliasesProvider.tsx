"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AliasRule = {
  id: string;
  pattern: string;
  label: string;
  mode: "contains" | "regex" | "prefix";
};
type AliasesCtx = {
  rules: AliasRule[];
  setRules: (r: AliasRule[]) => void;
  addRule: (r: Omit<AliasRule, "id">) => void;
  removeRule: (id: string) => void;
  applyAlias: (desc: string) => string | null;
};

const LS_KEY = "merchant.aliases.v1";
const Ctx = createContext<AliasesCtx | null>(null);

export function AliasesProvider({ children }: { children: React.ReactNode }) {
  const [rules, setRulesState] = useState<AliasRule[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setRulesState(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rules));
    } catch {}
  }, [rules]);

  const setRules = (r: AliasRule[]) => setRulesState(r);
  const addRule = (r: Omit<AliasRule, "id">) =>
    setRulesState((prev) => [{ id: crypto.randomUUID(), ...r }, ...prev]);
  const removeRule = (id: string) =>
    setRulesState((prev) => prev.filter((x) => x.id !== id));

  function applyAlias(desc: string): string | null {
    const d = desc.toLowerCase();
    for (const r of rules) {
      if (r.mode === "prefix" && d.startsWith(r.pattern.toLowerCase()))
        return r.label;
      if (r.mode === "contains" && d.includes(r.pattern.toLowerCase()))
        return r.label;
      if (r.mode === "regex") {
        try {
          if (new RegExp(r.pattern, "i").test(desc)) return r.label;
        } catch {}
      }
    }
    return null;
  }

  const value = useMemo(
    () => ({ rules, setRules, addRule, removeRule, applyAlias }),
    [rules]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAliases() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAliases must be used within AliasesProvider");
  return v;
}
