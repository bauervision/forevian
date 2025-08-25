// app/demo/bridge/useDemoStorageBridge.ts
"use client";
import { useEffect, useRef, useState } from "react";
import type { StatementSnapshot } from "@/lib/statements";
import { DEMO_MONTHS } from "@/app/demo/data";

const IDX_KEY = "reconciler.statements.index.v2";
const CUR_KEY = "reconciler.statements.current.v2";

const BK_IDX = "demo:backup:index";
const BK_CUR = "demo:backup:current";
const FLAG = "demo:active";

export function useDemoStorageBridge() {
  const did = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (did.current) return;
    did.current = true;
    if (typeof window === "undefined") return;

    // already active? just mark ready
    if (localStorage.getItem(FLAG) === "1") {
      setReady(true);
      return;
    }

    // backup
    localStorage.setItem(BK_IDX, localStorage.getItem(IDX_KEY) ?? "");
    localStorage.setItem(BK_CUR, localStorage.getItem(CUR_KEY) ?? "");

    // build demo index from /demo/data.ts
    const demoIndex: Record<string, StatementSnapshot> = {};
    for (const m of DEMO_MONTHS) {
      demoIndex[m.id] = {
        id: m.id,
        label: m.label,
        stmtYear: m.stmtYear,
        stmtMonth: m.stmtMonth,
        pagesRaw: [],
        inputs: m.inputs ?? {
          beginningBalance: 0,
          totalDeposits: 0,
          totalWithdrawals: 0,
        },
        cachedTx: m.cachedTx,
      };
    }

    // write demo into the real keys so existing pages read it
    localStorage.setItem(IDX_KEY, JSON.stringify(demoIndex));
    localStorage.setItem(CUR_KEY, DEMO_MONTHS.at(-1)?.id ?? "");
    localStorage.setItem(FLAG, "1");
    setReady(true);

    return () => {
      // restore on exit
      const idxBk = localStorage.getItem(BK_IDX);
      const curBk = localStorage.getItem(BK_CUR);

      if (idxBk !== null) localStorage.setItem(IDX_KEY, idxBk);
      else localStorage.removeItem(IDX_KEY);

      if (curBk !== null) localStorage.setItem(CUR_KEY, curBk);
      else localStorage.removeItem(CUR_KEY);

      localStorage.removeItem(BK_IDX);
      localStorage.removeItem(BK_CUR);
      localStorage.removeItem(FLAG);
    };
  }, []);

  return ready;
}
