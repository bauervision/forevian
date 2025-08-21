"use client";
import { IconKey } from "@/lib/icons";
import React from "react";
import {
  useAuthUID,
  userDoc,
  setWithRev,
  subscribeDoc,
  debounce,
} from "@/lib/fx";

export type BrandRule = {
  id: string;
  name: string;
  domain?: string;
  mode: "regex" | "keywords" | "exact";
  pattern: string;
  enabled?: boolean;
  noLogo?: boolean;
  icon?: IconKey | null;
};

type Ctx = {
  rules: BrandRule[];
  version: number;
  mounted: boolean;
  detect: (label: string) => BrandRule | null;
  logoFor: (labelOrDomain?: string | null) => string | null;
  upsertRule: (rule: BrandRule) => void;
  removeRule: (id: string) => void;
};

const BrandMapContext = React.createContext<Ctx | null>(null);

/* ---------- storage helpers ---------- */
const LS_KEY = "ui.brand.rules.v1";
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function normalizeRule(r: any): BrandRule {
  const mode: BrandRule["mode"] =
    r?.mode === "regex" || r?.mode === "exact" ? r.mode : "keywords";
  return {
    id: String(r?.id || ""),
    name: String(r?.name || "Brand"),
    domain: r?.domain ? String(r.domain) : "",
    mode,
    pattern: String(r?.pattern ?? r?.name ?? ""),
    enabled: r?.enabled !== false,
    noLogo: !!r?.noLogo,
    icon: (r?.icon ?? null) as IconKey | null,
  };
}
function loadRules(): BrandRule[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(normalizeRule) : [];
  } catch {
    return [];
  }
}
function saveRules(rules: BrandRule[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rules));
  } catch {}
}

/* ---------- provider ---------- */
export function BrandMapProvider({ children }: { children: React.ReactNode }) {
  const uid = useAuthUID();
  const [rules, setRules] = React.useState<BrandRule[]>([]);
  const [version, setVersion] = React.useState(0);
  const [mounted, setMounted] = React.useState(false);

  // init from localStorage only
  React.useEffect(() => {
    setRules(loadRules());
    setMounted(true);
  }, []);

  // persist to localStorage
  React.useEffect(() => {
    if (mounted) saveRules(rules);
  }, [rules, mounted]);

  const detect = React.useCallback(
    (label: string): BrandRule | null => {
      if (!label) return null;
      const L = norm(label);

      const byName = rules.find(
        (r) => r.enabled !== false && norm(r.name) === L
      );
      if (byName) return byName;

      for (const r of rules) {
        if (r.enabled === false || r.mode !== "exact") continue;
        if (norm(r.pattern) === L) return r;
      }
      for (const r of rules) {
        if (r.enabled === false || r.mode !== "keywords") continue;
        const words = (r.pattern || "")
          .split(/[, ]+/)
          .map(norm)
          .filter(Boolean);
        if (words.length && words.every((w) => L.includes(w))) return r;
      }
      for (const r of rules) {
        if (r.enabled === false || r.mode !== "regex") continue;
        try {
          if (new RegExp(r.pattern, "i").test(label)) return r;
        } catch {}
      }
      return null;
    },
    [rules]
  );

  const logoFor = React.useCallback(
    (labelOrDomain?: string | null): string | null => {
      if (!labelOrDomain) return null;

      if (!/\s/.test(labelOrDomain) && labelOrDomain.includes(".")) {
        return `https://logo.clearbit.com/${labelOrDomain}`;
      }
      const hit = detect(labelOrDomain);
      if (hit?.noLogo) return null;
      if (hit?.domain) return `https://logo.clearbit.com/${hit.domain}`;

      const first = labelOrDomain.toLowerCase().split(/\s+/)[0] || "brand";
      return `https://logo.clearbit.com/${first}.com`;
    },
    [detect]
  );

  /* ===== Firestore sync (permission-safe) ===== */

  // 1) Debounced writer with cancel()
  const saveRemote = React.useMemo(() => {
    const d = debounce(async (list: BrandRule[]) => {
      // guard inside the debounce too
      if (!uid) return;
      const ref = userDoc(uid, "settings", "brandRules");
      await setWithRev(ref, { rules: list });
    }, 700);
    return d;
  }, [uid]);

  // cancel any pending write on uid change/unmount
  React.useEffect(() => {
    return () => {
      // @ts-ignore
      saveRemote.cancel?.();
    };
  }, [saveRemote]);

  // 2) Bootstrap on sign-in (seed/pull once), then live-subscribe
  React.useEffect(() => {
    if (!uid) return; // signed out → no Firestore

    let unsub = () => {};
    (async () => {
      const ref = userDoc(uid, "settings", "brandRules");
      try {
        const { getDoc } = await import("firebase/firestore");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const remote = Array.isArray(snap.data().rules)
            ? (snap.data().rules as BrandRule[]).map(normalizeRule)
            : [];
          setRules((prev) => {
            const same =
              prev.length === remote.length &&
              prev.every(
                (p, i) => JSON.stringify(p) === JSON.stringify(remote[i])
              );
            return same ? prev : remote;
          });
        } else {
          // seed from local
          const seed = loadRules();
          await setWithRev(ref, { rules: seed });
          setRules(seed);
        }
      } catch (e) {
        console.debug("brandRules initial sync error", e);
      }

      // live subscribe (cleaned on uid change or unmount)
      unsub = subscribeDoc<{ rules: BrandRule[]; rev: number }>(ref, (data) => {
        if (!data) return;
        const remote = Array.isArray(data.rules)
          ? (data.rules as BrandRule[]).map(normalizeRule)
          : [];
        setRules((prev) => {
          const same =
            prev.length === remote.length &&
            prev.every(
              (p, i) => JSON.stringify(p) === JSON.stringify(remote[i])
            );
          return same ? prev : remote;
        });
      });
    })();

    return () => unsub();
  }, [uid]);

  // 3) Schedule debounced writes when signed in
  React.useEffect(() => {
    if (!uid) return;
    saveRemote(rules);
  }, [uid, rules, saveRemote]);

  /* ===== mutations ===== */
  const upsertRule = React.useCallback((incoming: BrandRule) => {
    const nextRule = normalizeRule(incoming);
    setRules((prev) => {
      let i = prev.findIndex((r) => r.id === nextRule.id);
      if (i < 0 && nextRule.name) {
        i = prev.findIndex((r) => norm(r.name) === norm(nextRule.name));
      }
      const updated =
        i >= 0
          ? [
              ...prev.slice(0, i),
              { ...prev[i], ...nextRule },
              ...prev.slice(i + 1),
            ]
          : [nextRule, ...prev];
      return updated;
    });
    setVersion((v) => v + 1);
  }, []);

  const removeRule = React.useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setVersion((v) => v + 1);
  }, []);

  const value = React.useMemo<Ctx>(
    () => ({
      rules,
      version,
      mounted,
      detect,
      logoFor,
      upsertRule,
      removeRule,
    }),
    [rules, version, mounted, detect, logoFor, upsertRule, removeRule]
  );

  return (
    <BrandMapContext.Provider value={value}>
      {children}
    </BrandMapContext.Provider>
  );
}

export function useBrandMap() {
  const ctx = React.useContext(BrandMapContext);
  if (!ctx) throw new Error("useBrandMap must be used inside BrandMapProvider");
  return ctx;
}
