"use client";
import React from "react";

/** How a rule is stored */
export type BrandRule = {
  id: string; // stable id
  name: string; // display name shown on cards
  domain: string; // e.g. "wendys.com"
  mode: "exact" | "keywords" | "regex";
  pattern: string; // label (exact), keywords (space/comma), or regex source
  enabled?: boolean;
};

const LS_KEY = "brand.rules.v1";

/** Built-in defaults: keep these minimal—users can add more from the dialog */
const DEFAULTS: BrandRule[] = [
  {
    id: "prime-video",
    name: "Prime Video",
    domain: "primevideo.com",
    mode: "regex",
    pattern: String(/\bprime\s*video\b/i).slice(1, -2),
  },
  {
    id: "amazon-fresh",
    name: "Amazon Fresh",
    domain: "amazon.com",
    mode: "regex",
    pattern: String(/\bamazon\s*fresh\b/i).slice(1, -2),
  },
  {
    id: "amazon-mkt",
    name: "Amazon Marketplace",
    domain: "amazon.com",
    mode: "regex",
    pattern: String(
      /\b(?:amzn|amazon)(?:\s*(?:mktp|market(?:place)?|mark\*|\.?com))?\b/i
    ).slice(1, -2),
  },

  {
    id: "dairy-queen",
    name: "Dairy Queen",
    domain: "dairyqueen.com",
    mode: "regex",
    pattern: String(/\b(?:dairy\s*queen|dq)\b/i).slice(1, -2),
  },
  {
    id: "cracker-barrel",
    name: "Cracker Barrel",
    domain: "crackerbarrel.com",
    mode: "regex",
    pattern: String(/\bcracker\s*barrel\b/i).slice(1, -2),
  },
  {
    id: "taste",
    name: "Taste",
    domain: "tasteunlimited.com",
    mode: "regex",
    pattern: String(/\btaste(?:\s+unlimited)?\b/i).slice(1, -2),
  },
  {
    id: "zaxbys",
    name: "Zaxby's",
    domain: "zaxbys.com",
    mode: "regex",
    pattern: String(/\bzaxby'?s?\b/i).slice(1, -2),
  },

  {
    id: "cava",
    name: "Cava",
    domain: "cava.com",
    mode: "exact",
    pattern: "cava",
  },
  {
    id: "pizza-hut",
    name: "Pizza Hut",
    domain: "pizzahut.com",
    mode: "regex",
    pattern: String(/\bpizza\s*hut\b/i).slice(1, -2),
  },
  {
    id: "wendys",
    name: "Wendy's",
    domain: "wendys.com",
    mode: "regex",
    pattern: String(/\bwendy'?s\b/i).slice(1, -2),
  },
  {
    id: "taco-bell",
    name: "Taco Bell",
    domain: "tacobell.com",
    mode: "regex",
    pattern: String(/\btaco\s*bell\b/i).slice(1, -2),
  },
  {
    id: "starbucks",
    name: "Starbucks",
    domain: "starbucks.com",
    mode: "exact",
    pattern: "starbucks",
  },
  {
    id: "target",
    name: "Target",
    domain: "target.com",
    mode: "exact",
    pattern: "target",
  },
  {
    id: "amazon",
    name: "Amazon",
    domain: "amazon.com",
    mode: "regex",
    pattern: String(/\b(?:amazon|amzn)\b/i).slice(1, -2),
  },
  {
    id: "costco",
    name: "Costco",
    domain: "costco.com",
    mode: "exact",
    pattern: "costco",
  },
  {
    id: "home-depot",
    name: "Home Depot",
    domain: "homedepot.com",
    mode: "regex",
    pattern: String(/\bhome\s*depot\b/i).slice(1, -2),
  },
  {
    id: "netflix",
    name: "Netflix",
    domain: "netflix.com",
    mode: "exact",
    pattern: "netflix",
  },
  {
    id: "judys",
    name: "Judy's",
    domain: "judyssichuancuisine.com",
    mode: "regex",
    pattern: String(/\bjudy'?s(?:\s+sichuan(?:\s+(?:ii|2))?)?\b/i).slice(1, -2),
  },
  {
    id: "honey-hooch",
    name: "Honey & Hooch",
    domain: "honeyandhooch.com",
    mode: "regex",
    pattern: String(/\bhoney\s*(?:&|and)\s*hooch\b/i).slice(1, -2),
  },
  {
    id: "three-amigos",
    name: "3 Amigos",
    domain: "3amigosmexicanrestaurants.com",
    mode: "regex",
    pattern: String(
      /\b3\s*amigos(?:\s+mexican(?:\s*r(?:estaurant|estaurants)?)?)?\b/i
    ).slice(1, -2),
  },
];

function normalize(s: string) {
  return (s || "").toLowerCase().trim();
}

function match(rule: BrandRule, text: string) {
  const t = text || "";
  if (rule.mode === "exact") {
    return normalize(t) === normalize(rule.pattern);
  }
  if (rule.mode === "keywords") {
    const words = rule.pattern
      .split(/[, ]+/)
      .map((w) => normalize(w))
      .filter(Boolean);
    const tl = normalize(t);
    return words.every((w) => tl.includes(w));
  }
  // regex
  try {
    const rx = new RegExp(rule.pattern, "i");
    return rx.test(t);
  } catch {
    return false;
  }
}

export type BrandContextValue = {
  mounted: boolean;
  rules: BrandRule[]; // user rules
  allRules: BrandRule[]; // user-first, then defaults
  upsertRule: (r: BrandRule) => void;
  removeRule: (id: string) => void;
  detect: (text: string) => BrandRule | null;
  logoFor: (textOrDomain: string) => string | null;
};

const BrandCtx = React.createContext<BrandContextValue | null>(null);

export function BrandMapProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  const [rules, setRules] = React.useState<BrandRule[]>([]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setRules(JSON.parse(raw));
    } catch {}
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rules));
    } catch {}
  }, [rules, mounted]);

  const allRules = React.useMemo(() => [...rules, ...DEFAULTS], [rules]);

  const detect = React.useCallback(
    (text: string) => {
      for (const r of allRules) {
        if (r.enabled === false) continue;
        if (match(r, text)) return r;
      }
      return null;
    },
    [allRules]
  );

  const upsertRule = React.useCallback((r: BrandRule) => {
    setRules((prev) => {
      const i = prev.findIndex((x) => x.id === r.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = r;
        return next;
      }
      return [r, ...prev];
    });
  }, []);

  const removeRule = React.useCallback((id: string) => {
    setRules((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const logoFor = React.useCallback(
    (textOrDomain: string) => {
      const hit = detect(textOrDomain);
      if (hit && hit.domain) return `https://logo.clearbit.com/${hit.domain}`;
      // if it looks like a domain already, try it
      if (textOrDomain.includes("."))
        return `https://logo.clearbit.com/${textOrDomain}`;
      // guess from first word
      const word = normalize(textOrDomain).split(/\s+/)[0];
      if (!word) return null;
      return `https://logo.clearbit.com/${word}.com`;
    },
    [detect]
  );

  const value: BrandContextValue = {
    mounted,
    rules,
    allRules,
    upsertRule,
    removeRule,
    detect,
    logoFor,
  };

  return <BrandCtx.Provider value={value}>{children}</BrandCtx.Provider>;
}

export function useBrandMap() {
  const ctx = React.useContext(BrandCtx);
  if (!ctx) throw new Error("useBrandMap must be used within BrandMapProvider");
  return ctx;
}
