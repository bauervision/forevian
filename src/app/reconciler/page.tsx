"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCategories } from "@/app/providers/CategoriesProvider";
import CategoryManagerDialog from "@/components/CategoryManagerDialog";
import { useAliases } from "@/app/providers/AliasesProvider";
import AliasManagerDialog from "@/components/AliasManagerDialog";
import {
  readIndex,
  readCurrentId,
  writeCurrentId,
  upsertStatement,
  emptyStatement,
  removeStatement,
  monthLabel,
  makeId,
  nextMonth,
  migrateLegacyIfNeeded,
  type StatementSnapshot,
  normalizePagesRaw,
  inferMonthFromPages,
} from "@/lib/statements";
import {
  readOverrides,
  writeOverride,
  keyForTx,
  type CatOverrideMap,
} from "@/lib/overrides";
import {
  extractCardLast4,
  stripAuthAndCard,
  userFromLast4,
  prettyDesc,
} from "@/lib/txEnrich";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import {
  readCatRules,
  applyCategoryRulesTo,
  upsertCategoryRules,
  candidateKeys,
} from "@/lib/categoryRules";
import CategoryRulesManager from "@/components/CategoryRulesManager";
import { normalizePageText } from "@/lib/textNormalizer";
import StatementSwitcher from "@/components/StatementSwitcher";

/* ----------------------------- small utilities ---------------------------- */

function persistCurrentStatementSnapshot({
  statements,
  currentId,
  stmtYear,
  stmtMonth,
  inputs,
  pages,
  txs,
}: {
  statements: Record<string, any>;
  currentId: string;
  stmtYear: number;
  stmtMonth: number;
  inputs: {
    beginningBalance?: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
  };
  pages: { raw: string }[];
  txs: import("@/app/providers/ReconcilerProvider").Transaction[];
}) {
  const s = statements[currentId];
  if (!s) return;
  const updated = {
    ...s,
    stmtYear,
    stmtMonth,
    pagesRaw: pages.map((p) => p.raw),
    inputs,
    cachedTx: txs,
  };
  upsertStatement(updated);
}

function loadLegacyLocal(): { pagesRaw?: string[]; inputs?: any } {
  try {
    const raw = localStorage.getItem("reconciler.cache.v1");
    if (raw) {
      const obj = JSON.parse(raw);
      const pagesRaw = normalizePagesRaw(obj?.pagesRaw || obj?.pages);
      const inputs =
        obj?.inputs && typeof obj.inputs === "object" ? obj.inputs : undefined;
      return { pagesRaw, inputs };
    }
  } catch {}
  try {
    const inRaw = localStorage.getItem("reconciler.inputs.v1");
    const inputs = inRaw ? JSON.parse(inRaw) : undefined;
    return { inputs };
  } catch {}
  return {};
}

const fmtUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => fmtUSD.format(n);

/** Very small canonical merchant mapping (extend as you like) */
const CANON: Array<[RegExp, string]> = [
  [/newrez|shellpoin/i, "Newrez (Mortgage)"],
  [/truist\s*ln|auto\s*loan/i, "Truist Loan"],
  [
    /\bchase\b.*\b(epay|e-?pay|card\s*payment|crd\s*epay)\b/i,
    "Chase Credit Card Payment",
  ],
  [
    /\b(capital\s*one|cap\s*one)\b.*\b(epay|e-?pay|card\s*payment|credit\s*card\s*pmt)\b/i,
    "Capital One Credit Card Payment",
  ],
  [/dominion\s*energy/i, "Dominion Energy"],
  [/virginia\s*natural\s*gas|vng/i, "Virginia Natural Gas"],
  [/cox\s*comm/i, "Cox Communications"],
  [/t-?mobile/i, "T-Mobile"],
  [/hp.*instant\s*ink/i, "HP Instant Ink"],
  [/apple\.com\/bill/i, "Apple.com/Bill"],
  [/discovery\+|discovery plus/i, "Discovery+"],
  [/netflix/i, "Netflix"],
  [/progressive|prog\s*gulf\s*ins/i, "Progressive Insurance"],
  [/pac.*life|pac-?life-?lyn-?inf/i, "Pacific Life Insurance"],
  [/school\s*of\s*rock/i, "School of Rock"],
  [/harris\s*te(?:eter)?|harris\s*te\b/i, "Harris Teeter"],
  [/food\s*lion/i, "Food Lion"],
  [/target\b|target\s*t-\s*\d+/i, "Target"],
  [/chick-?fil-?a/i, "Chick-fil-A"],
  [/cinema\s*cafe/i, "Cinema Cafe"],
  [/\bprime\s*video\b/i, "Prime Video"],
  [
    /\b(amazon\s*fresh|amazon\s*groc\w*|amzn\s*prime\s*now|prime\s*now|whole\s*foods)\b|(?:\bamzn\.?com\/bill\b.*\btip(s)?\b)/i,
    "Amazon Fresh",
  ],
  [
    /\b(?:amzn|amazon)(?:\s*(?:mktp|market(?:place)?|mark\*|\.?com))?\b/i,
    "Amazon Marketplace",
  ],
  [/bp#|shell\b|exxon|circle\s*k|7-?eleven|chevron/i, "Fuel Station"],
  [/adobe/i, "Adobe"],
  [/buzzsprout/i, "Buzzsprout"],
  [/ibm.*payroll/i, "IBM Payroll"],
  [/leidos.*payroll/i, "Leidos Payroll"],
  [/home\s*depot/i, "Home Depot"],
];

function canonMerchant(desc: string, fallback: string | null) {
  return CANON.find(([rx]) => rx.test(desc))?.[1] ?? fallback ?? "Unknown";
}

function canonCategory(desc: string, merch?: string | null) {
  const m = (merch ?? "").toLowerCase();
  const dl = (desc ?? "").toLowerCase();

  // Credits / income first
  if (
    /\b(payroll|e\s*deposit|deposit|vacp\s*treas|ssa|irs\s*treas|ach\s*credit|zelle\s*(from|credit)|online\s*transfer\s*from|xfer\s*from|branch\s*deposit|mobile\s*deposit|credit\s*interest|interest\s*(payment|credit)|refund|reversal|return)\b/i.test(
      dl
    )
  )
    return "Income";

  // ---------- Amazon family (specific → general) ----------
  // Prime Video
  if (m === "prime video" || /\bprime\s*video\b/.test(dl)) return "Prime Video";

  // Amazon Fresh (grocery-ish, Prime Now, Whole Foods, AMZN tips)
  if (
    m === "amazon fresh" ||
    /\b(amazon\s*fresh|amazon\s*groc\w*|amzn\s*prime\s*now|prime\s*now|whole\s*foods)\b/.test(
      dl
    ) ||
    (/\bamzn\.?com\/bill\b/.test(dl) && /\btip(s)?\b/.test(dl))
  )
    return "Amazon Fresh";

  // Marketplace (catch-all for Amazon / AMZN / Mktp / Mark* / Amazon.com)
  if (
    m === "amazon marketplace" ||
    /\b(?:amzn|amazon)(?:\s*(?:mktp|market(?:place)?|mark\*|\.?com))?\b/.test(
      dl
    )
  )
    return "Amazon Marketplace";

  // ---------- your existing merchant-based rules ----------
  if (merch === "Newrez (Mortgage)") return "Housing";
  if (merch === "Truist Loan") return "Debt";
  if (
    /(Dominion Energy|Virginia Natural Gas|T-Mobile|Cox Communications)/i.test(
      merch ?? ""
    )
  )
    return "Utilities";
  if (/(Progressive Insurance|Pacific Life Insurance)/i.test(merch ?? ""))
    return "Insurance";
  if (
    /(HP Instant Ink|Apple\.com\/Bill|Adobe|Buzzsprout|Discovery\+|Netflix|School of Rock)/i.test(
      merch ?? ""
    )
  )
    return "Subscriptions";
  if (/(Harris Teeter|Food Lion)/i.test(merch ?? "")) return "Groceries";
  if (/Home Depot/i.test(merch ?? "")) return "Shopping/Household";
  if (/Chick-fil-A/i.test(merch ?? "")) return "Dining";
  if (/Cinema Cafe/i.test(merch ?? "")) return "Entertainment";
  if (/Target/i.test(merch ?? "")) return "Shopping/Household";
  if (/Fuel Station/i.test(merch ?? "")) return "Gas";

  // Description-based last
  if (/online\s*transfer|inst\s*xfer|xfer/i.test(dl)) return "Transfers";
  if (/cash\s*back/i.test(dl)) return "Cash Back";

  return "Impulse/Misc";
}

/* ------------------------------- types/local ------------------------------ */

type ParsedLine = {
  dateIso?: string;
  dateDisplay: string;
  description: string;
  amount: number;
  tag?: "cb_cashback" | "card_purchase" | "deposit" | "billpay";
  parseNotes: string[];
};

type TxRow = {
  running: number;
  id: string;
  date: string;
  description: string;
  amount: number;
  raw?: string;
  notes?: string;
  category?: string;
  categoryOverride?: string;
  cardLast4?: string;
  user?: string;
  parseWarnings?: string[];
};

/* --------------------------- lightweight parser --------------------------- */
function rebuildFromPages(
  pagesRaw: string[],
  stmtYear: number,
  applyAlias: (d: string) => string | null
): { txs: TxRow[] } {
  const IS_DATE_SOLO = /^\d{1,2}\/\d{1,2}\s*$/;
  const DATE_AT_START = /^\d{1,2}\/\d{1,2}\b/;
  const AMT_ONLY = /^\$?\s*\d[\d,]*\.\d{2}\s*$/;
  const AMT_INLINE_RX = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2}))/g;

  const PURCHASE_RX = /Purchase\s+authorized\s+on/i;
  const CASHBACK_RX = /Purchase\s+with\s+Cash\s*Back\b/i;

  const DEP_RX =
    /\b(pay\s*roll|direct\s*deposit|e\s*deposit|edeposit|ach\s*credit|vacp\s*treas|inst\s*xfer\s*from|irs\s*treas|ssa|mobile\s*deposit|branch\s*deposit|zelle\s*(from|credit))\b/i;

  const XFER_FROM_RX = /\b(online\s*)?(transfer|xfer)\s*(from)\b/i;
  const XFER_TO_RX = /\b(online\s*)?(transfer|xfer)\s*(to)\b/i;
  const ZELLE_FROM_RX = /\bzelle\b.*\b(from|credit)\b/i;
  const ZELLE_TO_RX = /\bzelle\b.*\b(to|payment)\b/i;
  const ACH_CREDIT_RX = /\bach\s*credit\b/i;
  const ACH_DEBIT_RX = /\bach\s*debit\b/i;
  const CARD_PAYMENT_RX =
    /\b(epay|e-?pay|card\s*payment|crd\s*epay|credit\s*card\s*pmt)\b/i;

  const parseIsoFromMmdd = (mmdd: string) => {
    const m = mmdd.match(/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    return `${stmtYear}-${mm}-${dd}`;
  };

  const rows: ParsedLine[] = [];

  pagesRaw.forEach((raw) => {
    const L = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    let curDateIso: string | null = null;
    for (let i = 0; i < L.length; i++) {
      const line = L[i];

      if (IS_DATE_SOLO.test(line)) {
        curDateIso = parseIsoFromMmdd(line);
        continue;
      }

      if (
        /^(Beginning balance on|Ending balance on|Deposits\/Additions|Withdrawals\/Subtractions|Account\s+summary|Daily\s+(ending|ledger)\s+balance|Page\s+\d+\s+of\s+\d+|Fee\s+period)/i.test(
          line
        )
      )
        continue;

      let descriptor = line;
      let dispDate: string | null = curDateIso ? curDateIso.slice(5) : null;

      if (DATE_AT_START.test(line) && PURCHASE_RX.test(line)) {
        const md = line.match(/^\d{1,2}\/\d{1,2}/)![0];
        curDateIso = parseIsoFromMmdd(md);
        dispDate = md;
        descriptor = line.replace(/^\d{1,2}\/\d{1,2}\s+/, "");
      }

      // find amount-only after this descriptor
      let amount: number | null = null;
      let amtIdx: number | null = null;
      let hasBalanceNext = false;

      for (let j = i + 1; j < L.length; j++) {
        const s = L[j];
        if (
          IS_DATE_SOLO.test(s) ||
          DATE_AT_START.test(s) ||
          /^(Beginning balance on|Ending balance on|Deposits\/Additions|Withdrawals\/Subtractions|Account\s+summary|Daily\s+(ending|ledger)\s+balance|Page\s+\d+\s+of\s+\d+|Fee\s+period)/i.test(
            s
          )
        )
          break;
        if (AMT_ONLY.test(s)) {
          amount = Number(s.replace(/[^0-9.]/g, ""));
          amtIdx = j;
          if (j + 1 < L.length && AMT_ONLY.test(L[j + 1]))
            hasBalanceNext = true;
          break;
        }
      }

      // inline fallback (prev+curr+next)
      if (amount == null) {
        const blob = [L[i - 1] || "", line, L[i + 1] || ""].join(" ");
        const nums = [...blob.matchAll(AMT_INLINE_RX)].map((m) =>
          Number(m[1].replace(/,/g, ""))
        );
        if (nums.length >= 1) amount = nums[0];
      }

      // cash back split
      if (CASHBACK_RX.test(descriptor) && amount != null) {
        const cbM = descriptor.match(
          /cash\s*back\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?)/i
        );
        const cashback = cbM ? Number(cbM[1].replace(/,/g, "")) : 0;
        const dateDisplay = dispDate
          ? dispDate
          : curDateIso
          ? curDateIso.slice(5).replace("-", "/")
          : "";

        const gross = amount;
        const spendPortion = Math.max(0, +(gross - cashback).toFixed(2));
        if (spendPortion > 0) {
          rows.push({
            dateDisplay,
            description: descriptor,
            amount: -spendPortion,
            tag: "card_purchase",
            parseNotes: ["cashback-split"],
          });
        }
        if (cashback > 0) {
          rows.push({
            dateDisplay,
            description: `${descriptor} (Cash back $${cashback.toFixed(2)})`,
            amount: -cashback,
            tag: "cb_cashback",
            parseNotes: ["cashback-split"],
          });
        }

        if (amtIdx != null) i = amtIdx + (hasBalanceNext ? 1 : 0);
        continue;
      }

      if (amount == null) continue;

      const dlow = descriptor.toLowerCase();
      let signed = -Math.abs(amount); // default debit
      if (
        /\b(online\s*)?(transfer|xfer)\s*(from)\b/i.test(dlow) ||
        /\bzelle\b.*\b(from|credit)\b/i.test(dlow) ||
        /\bach\s*credit\b/i.test(dlow) ||
        /\b(payment\s*received|pmt\s*rcvd|thank\s*you)\b/i.test(dlow) ||
        /\b(refund|reversal|return)\b/i.test(dlow) ||
        /\b(credit\s*interest|interest\s*(payment|credit))\b/i.test(dlow) ||
        /\b(vacp\s*treas|us\s*treas|irs\s*treas|ssa|social\s*security|treasury)\b/i.test(
          dlow
        ) ||
        DEP_RX.test(dlow)
      ) {
        signed = Math.abs(amount); // credit
      }
      if (
        /\b(online\s*)?(transfer|xfer)\s*(to)\b/i.test(dlow) ||
        /\bzelle\b.*\b(to|payment)\b/i.test(dlow) ||
        /\bach\s*debit\b/i.test(dlow) ||
        /\b(epay|e-?pay|card\s*payment|crd\s*epay|credit\s*card\s*pmt)\b/i.test(
          dlow
        )
      ) {
        signed = -Math.abs(amount);
      }

      const dateDisplay = dispDate
        ? dispDate
        : curDateIso
        ? curDateIso.slice(5).replace("-", "/")
        : "";

      rows.push({
        dateDisplay,
        description: descriptor,
        amount: signed,
        tag: signed > 0 ? "deposit" : "card_purchase",
        parseNotes: [],
      });

      if (amtIdx != null) i = amtIdx + (hasBalanceNext ? 1 : 0);
    }
  });

  const overrides: CatOverrideMap =
    typeof window !== "undefined" ? readOverrides() : {};
  const txs: TxRow[] = rows.map((r, idx) => {
    const rawDesc = r.description;
    const last4 = extractCardLast4(rawDesc);
    const cleaned = stripAuthAndCard(rawDesc);
    const aliasLabel =
      (typeof window !== "undefined" && (window as any).__applyAlias
        ? (window as any).__applyAlias(cleaned)
        : null) || null;

    const merch = aliasLabel ?? canonMerchant(cleaned, null);
    const baseCat =
      r.tag === "cb_cashback" ? "Cash Back" : canonCategory(cleaned, merch);
    const dateMMDD = r.dateDisplay || "";

    const k = keyForTx(dateMMDD, cleaned, r.amount);
    const categoryOverride = overrides[k];

    return {
      running: 0,
      id: `tx-${idx}-${dateMMDD}-${Math.abs(r.amount).toFixed(2)}`,
      date: dateMMDD,
      description: cleaned,
      amount: r.amount,
      category: baseCat,
      categoryOverride,
      cardLast4: last4,
      user: userFromLast4(last4),
      notes: r.parseNotes.join("; "),
    };
  });

  return { txs };
}

/* --------------------------- category select UI --------------------------- */

const CATEGORY_ADD_SENTINEL = "__ADD__";

function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { categories } = useCategories();
  const [openMgr, setOpenMgr] = React.useState(false);

  const sorted = React.useMemo(() => {
    const list = [...categories].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    const i = list.findIndex((x) => x.toLowerCase() === "uncategorized");
    if (i >= 0) {
      list.splice(i, 1);
      list.push("Uncategorized");
    }
    return list;
  }, [categories]);

  return (
    <>
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CATEGORY_ADD_SENTINEL) {
            setOpenMgr(true);
            return;
          }
          onChange(v);
        }}
        className="bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl px-2 py-1"
      >
        {sorted.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={CATEGORY_ADD_SENTINEL}>＋ Add Category…</option>
      </select>
      <CategoryManagerDialog open={openMgr} onClose={() => setOpenMgr(false)} />
    </>
  );
}

/* ------------------------------ tiny UI bits ------------------------------ */

function Panel(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = "", ...rest } = props;
  return (
    <section
      className={`rounded-2xl border border-slate-700 bg-slate-900 ${className}`}
      {...rest}
    />
  );
}

function ToolbarButton({
  children,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "danger";
}) {
  const base =
    "h-9 px-3 rounded-2xl border text-sm bg-slate-900 border-slate-700 " +
    "hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60";
  const danger =
    "border-rose-500/70 text-rose-300 hover:bg-rose-900/20 focus:ring-rose-500/50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${variant === "danger" ? danger : ""}`}
    >
      {children}
    </button>
  );
}

function StatusTile({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub?: string;
  tone: "ok" | "warn" | "bad";
}) {
  const border =
    tone === "ok"
      ? "border-emerald-500"
      : tone === "warn"
      ? "border-amber-500"
      : "border-rose-500";
  const valueColor =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "warn"
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <div className={`rounded-2xl border ${border} border-l-4 p-3`}>
      <div className="text-xs text-slate-400">{title}</div>
      <div className={`text-lg font-semibold ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

/* --------------------------------- page ---------------------------------- */

export default function ReconcilerPage() {
  const { applyAlias } = useAliases();
  // make alias available to parser (avoid prop drilling)
  React.useEffect(() => {
    (window as any).__applyAlias = applyAlias;
  }, [applyAlias]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Provider state for sharing with dashboard
  const { transactions, setTransactions, inputs, setInputs } =
    useReconcilerSelectors();

  // Statement management
  const [statements, setStatements] = React.useState<
    Record<string, StatementSnapshot>
  >({});
  const [currentId, setCurrentId] = React.useState<string>("");
  const [stmtYear, setStmtYear] = React.useState<number>(
    new Date().getFullYear()
  );
  const [stmtMonth, setStmtMonth] = React.useState<number>(
    new Date().getMonth() + 1
  );

  // Page accumulator
  const [paste, setPaste] = React.useState("");
  const [pages, setPages] = React.useState<
    { idx: number; raw: string; lines: number }[]
  >([]);

  // Dialogs
  const [openAliases, setOpenAliases] = React.useState(false);
  const [openRules, setOpenRules] = React.useState(false);
  // Accordion state
  const [openDate, setOpenDate] = React.useState<Record<string, boolean>>({});

  // helper: keep ?statement in URL
  const setStatementInUrl = React.useCallback(
    (id?: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (id) sp.set("statement", id);
      else sp.delete("statement");
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [router, pathname, searchParams]
  );

  function sumDeposits(rows: { amount: number }[]) {
    return rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  }
  function sumWithdrawals(rows: { amount: number }[]) {
    return rows.reduce(
      (s, r) => s + (r.amount < 0 ? Math.abs(r.amount) : 0),
      0
    );
  }

  /** Button: set totals to the parsed sums for the selected statement */
  function prefillTotalsFromParsed() {
    const parsedDeposits = +sumDeposits(transactions).toFixed(2);
    const parsedWithdrawals = +sumWithdrawals(transactions).toFixed(2);
    updateInputs({
      totalDeposits: parsedDeposits,
      totalWithdrawals: parsedWithdrawals,
    });
  }

  /** Button: set this month’s beginning to previous month’s computed ending */
  function prefillBeginningFromPrev() {
    const idx = readIndex();
    const list = Object.values(idx).sort(
      (a, b) => a.stmtYear - b.stmtYear || a.stmtMonth - b.stmtMonth
    );
    const curPos = list.findIndex((s) => s.id === currentId);
    if (curPos <= 0) return; // no previous month

    const prev = list[curPos - 1];
    const prevRows = Array.isArray(prev.cachedTx) ? prev.cachedTx : [];
    const prevBegin = prev.inputs?.beginningBalance ?? 0;
    const prevEnd = +(
      prevBegin +
      sumDeposits(prevRows) -
      sumWithdrawals(prevRows)
    ).toFixed(2);

    updateInputs({ beginningBalance: prevEnd });
  }

  React.useEffect(() => {
    // migrate / bootstrap
    const mig = migrateLegacyIfNeeded();

    let idx = readIndex();
    if (!Object.keys(idx).length) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const id = makeId(y, m);
      const label = `${monthLabel(m)} ${y}`;
      upsertStatement(emptyStatement(id, label, y, m));
      idx = readIndex();
    }

    setStatements(idx);
    const initialUrlStatement = searchParams.get("statement");
    const cid = initialUrlStatement || readCurrentId() || Object.keys(idx)[0];
    setCurrentId(cid);
    writeCurrentId(cid);
    if (!initialUrlStatement) setStatementInUrl(cid);

    let cur = idx[cid];
    if (!cur) return;

    if ((!cur.pagesRaw || !cur.pagesRaw.length) && !mig.createdId) {
      const legacy = loadLegacyLocal();
      const pagesRaw = legacy.pagesRaw || [];
      if (pagesRaw.length) {
        const y = cur.stmtYear || new Date().getFullYear();
        const m =
          cur.stmtMonth ||
          inferMonthFromPages(pagesRaw, y) ||
          new Date().getMonth() + 1;
        const recovered: StatementSnapshot = {
          id: makeId(y, m),
          label: `Recovered ${monthLabel(m)} ${y}`,
          stmtYear: y,
          stmtMonth: m,
          pagesRaw,
          inputs: {
            beginningBalance: Number(legacy.inputs?.beginningBalance) || 0,
            totalDeposits: Number(legacy.inputs?.totalDeposits) || 0,
            totalWithdrawals: Number(legacy.inputs?.totalWithdrawals) || 0,
          },
        };
        upsertStatement(recovered);
        const fresh = readIndex();
        setStatements(fresh);
        setCurrentId(recovered.id);
        writeCurrentId(recovered.id);
        setStatementInUrl(recovered.id);
        cur = recovered;
      } else if (legacy.inputs) {
        cur = {
          ...cur,
          inputs: {
            beginningBalance: Number(legacy.inputs.beginningBalance) || 0,
            totalDeposits: Number(legacy.inputs.totalDeposits) || 0,
            totalWithdrawals: Number(legacy.inputs.totalWithdrawals) || 0,
          },
        };
        upsertStatement(cur);
        const fresh = readIndex();
        setStatements(fresh);
      }
    }

    setStmtYear(cur.stmtYear);
    setStmtMonth(cur.stmtMonth);
    setInputs({
      beginningBalance: cur.inputs?.beginningBalance ?? 0,
      totalDeposits: cur.inputs?.totalDeposits ?? 0,
      totalWithdrawals: cur.inputs?.totalWithdrawals ?? 0,
    });

    if (cur.pagesRaw && cur.pagesRaw.length) {
      const pagesSanitized = (cur.pagesRaw || []).map(normalizePageText);
      const res = rebuildFromPages(pagesSanitized, cur.stmtYear, applyAlias);

      setPages(
        cur.pagesRaw.map((raw, i) => ({
          idx: i,
          raw,
          lines: raw.split(/\r?\n/).filter(Boolean).length,
        }))
      );

      const rules = readCatRules();
      const txWithRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      setTransactions(txWithRules);
      persistCurrentStatementSnapshot({
        statements,
        currentId: cid,
        stmtYear: cur.stmtYear,
        stmtMonth: cur.stmtMonth,
        inputs: {
          beginningBalance: cur.inputs?.beginningBalance ?? 0,
          totalDeposits: cur.inputs?.totalDeposits ?? 0,
          totalWithdrawals: cur.inputs?.totalWithdrawals ?? 0,
        },
        pages: cur.pagesRaw.map((raw) => ({ raw })),
        txs: txWithRules,
      });
    } else {
      setPages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // respond to URL changes
  const urlStatement = searchParams.get("statement") ?? "";
  React.useEffect(() => {
    if (!urlStatement) return;
    if (currentId && currentId === urlStatement) return;
    onSwitchStatement(urlStatement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatement]);

  // Keep accordion defaults in sync with transactions
  React.useEffect(() => {
    const dates = new Set<string>();
    for (const t of transactions) if (t.amount < 0) dates.add(t.date || "");
    setOpenDate((prev) => {
      const next = { ...prev };
      for (const d of dates) if (!(d in next)) next[d] = true;
      return next;
    });
  }, [transactions]);

  function addPage() {
    const raw = paste.trim();
    if (!raw) return;

    const cleaned = normalizePageText(raw);
    const next = [
      ...pages,
      {
        idx: pages.length,
        raw: cleaned,
        lines: cleaned.split(/\r?\n/).filter(Boolean).length,
      },
    ];
    setPages(next);
    setPaste("");

    const cur = statements[currentId];
    const updated: StatementSnapshot = {
      ...(cur ??
        emptyStatement(
          currentId,
          `${monthLabel(stmtMonth)} ${stmtYear}`,
          stmtYear,
          stmtMonth
        )),
      stmtYear,
      stmtMonth,
      pagesRaw: next.map((p) => p.raw),
      inputs: {
        beginningBalance: inputs.beginningBalance ?? 0,
        totalDeposits: inputs.totalDeposits ?? 0,
        totalWithdrawals: inputs.totalWithdrawals ?? 0,
      },
    };

    upsertStatement(updated);
    setStatements(readIndex());

    const pagesSanitized = (updated.pagesRaw || []).map(normalizePageText);
    const res = rebuildFromPages(pagesSanitized, updated.stmtYear, applyAlias);
    setTransactions(res.txs);
    persistCurrentStatementSnapshot({
      statements,
      currentId,
      stmtYear: updated.stmtYear,
      stmtMonth: updated.stmtMonth,
      inputs,
      pages: next.map((p) => ({ raw: p.raw })),
      txs: res.txs,
    });
  }

  function removePage(idx: number) {
    const next = pages
      .filter((p) => p.idx !== idx)
      .map((p, i) => ({ ...p, idx: i }));
    setPages(next);

    const cur = statements[currentId];
    if (!cur) return;
    const updated = { ...cur, pagesRaw: next.map((p) => p.raw) };
    upsertStatement(updated);
    setStatements(readIndex());

    const pagesSanitized = (updated.pagesRaw || []).map(normalizePageText);
    const res = rebuildFromPages(pagesSanitized, updated.stmtYear, applyAlias);
    setTransactions(res.txs);
    persistCurrentStatementSnapshot({
      statements,
      currentId,
      stmtYear,
      stmtMonth,
      inputs,
      pages: next.map((p) => ({ raw: p.raw })),
      txs: res.txs,
    });
  }

  function rerunParsing() {
    const cur = statements[currentId];
    const rawPages = cur?.pagesRaw ?? pages.map((p) => p.raw);
    const res = rebuildFromPages(rawPages, stmtYear, applyAlias);
    setTransactions(res.txs);
    persistCurrentStatementSnapshot({
      statements,
      currentId,
      stmtYear,
      stmtMonth,
      inputs,
      pages,
      txs: res.txs,
    });
  }

  function createStatement() {
    const { year: ny, month: nm } = nextMonth(stmtYear, stmtMonth);
    const id = makeId(ny, nm);
    const label = `${monthLabel(nm)} ${ny}`;
    const s = emptyStatement(id, label, ny, nm);
    upsertStatement(s);

    const idx = readIndex();
    setStatements(idx);
    setCurrentId(id);
    writeCurrentId(id);
    setStatementInUrl(id);
    setStmtYear(ny);
    setStmtMonth(nm);

    setInputs({ beginningBalance: 0, totalDeposits: 0, totalWithdrawals: 0 });
    setPages([]);
    setTransactions([]);
  }

  function onSwitchStatement(id: string) {
    // 1) Commit the current statement (save its inputs/pages/txs)
    const prev = readIndex()[currentId];
    if (prev) {
      persistCurrentStatementSnapshot({
        statements: readIndex(),
        currentId: currentId,
        stmtYear: prev.stmtYear,
        stmtMonth: prev.stmtMonth,
        inputs, // ← current state's inputs belong to "currentId"
        pages: (prev.pagesRaw || []).map((raw) => ({ raw })),
        txs: transactions,
      });
    }

    // 2) Switch to the new statement
    setCurrentId(id);
    writeCurrentId(id);

    const s = readIndex()[id];
    if (!s) return;

    const newInputs = {
      beginningBalance: s.inputs?.beginningBalance ?? 0,
      totalDeposits: s.inputs?.totalDeposits ?? 0,
      totalWithdrawals: s.inputs?.totalWithdrawals ?? 0,
    };
    setStmtYear(s.stmtYear);
    setStmtMonth(s.stmtMonth);
    setInputs(newInputs);

    setPages(
      (s.pagesRaw || []).map((raw, i) => ({
        idx: i,
        raw,
        lines: raw.split(/\r?\n/).filter(Boolean).length,
      }))
    );

    const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
    const res = rebuildFromPages(pagesSanitized || [], s.stmtYear, applyAlias);
    setTransactions(res.txs);

    // 3) Persist the NEW statement using the **newInputs** (not stale state)
    persistCurrentStatementSnapshot({
      statements: readIndex(),
      currentId: id,
      stmtYear: s.stmtYear,
      stmtMonth: s.stmtMonth,
      inputs: newInputs,
      pages: (s.pagesRaw || []).map((raw) => ({ raw })),
      txs: res.txs,
    });
  }

  function updateInputs(partial: Partial<typeof inputs>) {
    const next = { ...inputs, ...partial };
    setInputs(next);
    const s = readIndex()[currentId];
    if (s) {
      upsertStatement({ ...s, inputs: next });
    }
  }

  // Totals/derived views
  const deposits = React.useMemo(
    () => transactions.filter((t) => (t.amount ?? 0) > 0),
    [transactions]
  );
  const withdrawals = React.useMemo(
    () => transactions.filter((t) => (t.amount ?? 0) < 0),
    [transactions]
  );

  const groups = React.useMemo(() => {
    const m = new Map<string, { rows: TxRow[]; total: number }>();
    for (const t of withdrawals) {
      const k = t.date || "";
      const g = m.get(k) ?? { rows: [], total: 0 };
      g.rows.push(t);
      g.total += Math.abs(t.amount);
      m.set(k, g);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [withdrawals]);

  const parsedDeposits = +deposits
    .reduce((s, r) => s + (r.amount ?? 0), 0)
    .toFixed(2);
  const parsedWithdrawals = +withdrawals
    .reduce((s, r) => s + Math.abs(r.amount ?? 0), 0)
    .toFixed(2);
  const endingBalance = +(
    (inputs.beginningBalance ?? 0) +
    parsedDeposits -
    parsedWithdrawals
  ).toFixed(2);

  const depDelta = +(parsedDeposits - (inputs.totalDeposits ?? 0)).toFixed(2);
  const wdrDelta = +(
    parsedWithdrawals - (inputs.totalWithdrawals ?? 0)
  ).toFixed(2);
  const endDelta = +(
    endingBalance -
    ((inputs.beginningBalance ?? 0) +
      (inputs.totalDeposits ?? 0) -
      (inputs.totalWithdrawals ?? 0))
  ).toFixed(2);

  /* ---------------------------------- UI ---------------------------------- */

  // IDs for the switcher
  const availableIds = React.useMemo(() => {
    const list = Object.values(statements)
      .map((s) => ({ id: s.id, y: s.stmtYear, m: s.stmtMonth }))
      .sort((a, b) => a.y - b.y || a.m - b.m)
      .map((x) => x.id);
    return list;
  }, [statements]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Reconciler</h1>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="text-xs uppercase tracking-wide text-slate-400">
          Statement
        </span>
        <StatementSwitcher
          available={availableIds}
          showLabel={false}
          size="sm"
          className="w-44 sm:w-56"
        />

        <ToolbarButton onClick={createStatement}>+ New Statement</ToolbarButton>

        {currentId && (
          <ToolbarButton
            variant="danger"
            onClick={() => {
              if (confirm("Delete this statement?")) {
                removeStatement(currentId);
                const idx = readIndex();
                setStatements(idx);
                const nextId = readCurrentId();
                if (nextId) {
                  onSwitchStatement(nextId);
                } else {
                  setCurrentId("");
                  setPages([]);
                  setTransactions([]);
                }
              }
            }}
          >
            Delete
          </ToolbarButton>
        )}

        <div className="ml-auto flex items-center gap-2">
          <ToolbarButton onClick={() => setOpenAliases(true)}>
            Manage Aliases
          </ToolbarButton>
          <ToolbarButton onClick={() => setOpenRules(true)}>
            Manage Rules
          </ToolbarButton>
        </div>

        <AliasManagerDialog
          open={openAliases}
          onClose={() => setOpenAliases(false)}
        />
        <CategoryRulesManager
          open={openRules}
          onClose={() => setOpenRules(false)}
        />
      </div>

      {/* Statement numbers */}
      <Panel className="p-4">
        <h3 className="font-semibold mb-3">Statement numbers</h3>

        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div className="flex flex-wrap gap-2 mt-2">
            <ToolbarButton onClick={prefillTotalsFromParsed}>
              Use parsed totals
            </ToolbarButton>
            <ToolbarButton onClick={prefillBeginningFromPrev}>
              Use previous ending as beginning
            </ToolbarButton>
          </div>

          <div>
            <label className="text-xs block mb-1 text-slate-400">
              Statement Year
            </label>
            <input
              type="number"
              className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={stmtYear}
              onChange={(e) => setStmtYear(Number(e.target.value) || stmtYear)}
            />
          </div>

          <div>
            <label className="text-xs block mb-1 text-slate-400">
              Statement Month
            </label>
            <select
              className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={stmtMonth}
              onChange={(e) => setStmtMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs block mb-1 text-slate-400">
              Beginning Balance
            </label>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={inputs.beginningBalance ?? 0}
              onChange={(e) =>
                updateInputs({ beginningBalance: Number(e.target.value) || 0 })
              }
            />
          </div>

          <div>
            <label className="text-xs block mb-1 text-slate-400">
              Total Deposits
            </label>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={inputs.totalDeposits ?? 0}
              onChange={(e) =>
                updateInputs({ totalDeposits: Number(e.target.value) || 0 })
              }
            />
          </div>

          <div>
            <label className="text-xs block mb-1 text-slate-400">
              Total Withdrawals
            </label>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2"
              value={inputs.totalWithdrawals ?? 0}
              onChange={(e) =>
                updateInputs({ totalWithdrawals: Number(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        {/* Reconciliation status */}
        <div className="grid md:grid-cols-3 gap-3 mt-4 text-sm">
          <StatusTile
            title="Parsed Deposits"
            value={money(parsedDeposits)}
            sub={`User: ${money(inputs.totalDeposits ?? 0)} (Δ ${money(
              depDelta
            )})`}
            tone={depDelta === 0 ? "ok" : "warn"}
          />
          <StatusTile
            title="Parsed Withdrawals"
            value={money(parsedWithdrawals)}
            sub={`User: ${money(inputs.totalWithdrawals ?? 0)} (Δ ${money(
              wdrDelta
            )})`}
            tone={wdrDelta === 0 ? "ok" : "warn"}
          />
          <StatusTile
            title="Ending Balance"
            value={money(endingBalance)}
            sub={`User: ${money(
              (inputs.beginningBalance ?? 0) +
                (inputs.totalDeposits ?? 0) -
                (inputs.totalWithdrawals ?? 0)
            )} (Δ ${money(endDelta)})`}
            tone={endDelta === 0 ? "ok" : "bad"}
          />
        </div>
      </Panel>

      {/* paste area + pages */}
      <Panel className="p-4 space-y-3">
        <h3 className="font-semibold">Add page</h3>
        <textarea
          rows={6}
          className="w-full rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2 placeholder-slate-500"
          placeholder="Paste one statement page here…"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <ToolbarButton onClick={addPage}>+ Add Page</ToolbarButton>
          <ToolbarButton onClick={rerunParsing}>Re-run parsing</ToolbarButton>
          <ToolbarButton
            onClick={() => {
              const rules = readCatRules();
              const reapplied = applyCategoryRulesTo(
                rules,
                transactions,
                applyAlias
              );
              setTransactions(reapplied);
              persistCurrentStatementSnapshot({
                statements,
                currentId,
                stmtYear,
                stmtMonth,
                inputs,
                pages,
                txs: reapplied,
              });
            }}
          >
            Reapply rules
          </ToolbarButton>
        </div>

        {pages.length > 0 && (
          <div className="text-sm">
            <div className="opacity-70 mb-2">Imported pages</div>
            <ul className="flex flex-wrap gap-2">
              {pages.map((p) => (
                <li
                  key={p.idx}
                  className="flex items-center gap-2 border border-slate-700 rounded-2xl px-2 py-1"
                >
                  <span>Page {p.idx + 1}</span>
                  <span className="opacity-60">({p.lines} lines)</span>
                  <button
                    className="text-xs border border-slate-700 rounded-xl px-2 py-0.5 hover:bg-slate-800"
                    onClick={() => removePage(p.idx)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {/* accordion controls */}
      <div className="flex gap-2">
        <button
          className="text-xs border border-slate-700 rounded-2xl px-2 py-1 hover:bg-slate-800"
          onClick={() => {
            const all: Record<string, boolean> = {};
            for (const [d] of groups) all[d] = true;
            setOpenDate(all);
          }}
        >
          Expand all
        </button>
        <button
          className="text-xs border border-slate-700 rounded-2xl px-2 py-1 hover:bg-slate-800"
          onClick={() => {
            const all: Record<string, boolean> = {};
            for (const [d] of groups) all[d] = false;
            setOpenDate(all);
          }}
        >
          Collapse all
        </button>
      </div>

      {/* withdrawals grouped by date */}
      <div className="rounded-2xl border border-slate-700 divide-y divide-slate-800 overflow-x-auto">
        {groups.map(([date, g]) => (
          <div key={date}>
            <button
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-900"
              onClick={() => setOpenDate((s) => ({ ...s, [date]: !s[date] }))}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold">{date}</span>
                <span className="text-xs text-slate-400">
                  ({g.rows.length} tx)
                </span>
              </div>
              <div className="text-sm">
                Day total:{" "}
                <span className="font-medium text-rose-400">
                  {money(g.total)}
                </span>
              </div>
            </button>

            {openDate[date] && (
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="text-left p-2 w-1/2">Description</th>
                    <th className="text-left p-2">Category</th>
                    <th className="text-left p-2">User</th>
                    <th className="text-right p-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((t) => (
                    <tr key={t.id} className="border-t border-slate-800">
                      <td className="p-2">{prettyDesc(t.description)}</td>
                      <td className="p-2">
                        <CategorySelect
                          value={
                            t.categoryOverride ?? t.category ?? "Uncategorized"
                          }
                          onChange={(val) => {
                            const aliasLabel = applyAlias(
                              stripAuthAndCard(t.description || "")
                            );
                            const keys = candidateKeys(
                              t.description || "",
                              aliasLabel
                            );
                            const k = keyForTx(
                              t.date || "",
                              t.description || "",
                              t.amount ?? 0
                            );
                            writeOverride(k, val);
                            upsertCategoryRules(keys, val);

                            const rules = readCatRules();
                            const withRules = applyCategoryRulesTo(
                              rules,
                              transactions,
                              applyAlias
                            ).map((r) =>
                              r.id === t.id
                                ? { ...r, categoryOverride: val }
                                : r
                            );
                            setTransactions(withRules);
                            persistCurrentStatementSnapshot({
                              statements,
                              currentId,
                              stmtYear,
                              stmtMonth,
                              inputs,
                              pages,
                              txs: withRules,
                            });
                          }}
                        />
                      </td>
                      <td className="p-2">
                        {t.user ??
                          (t.cardLast4
                            ? userFromLast4(t.cardLast4)
                            : "Unknown")}
                      </td>
                      <td className="p-2 text-right text-rose-400">
                        {money(Math.abs(t.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {groups.length === 0 && (
          <div className="p-3 text-sm text-slate-400">
            No withdrawals parsed yet.
          </div>
        )}
      </div>

      {/* deposits table */}
      <Panel className="p-4 overflow-x-auto">
        <h3 className="font-semibold mb-3">Deposits</h3>
        {deposits.length === 0 ? (
          <div className="text-sm text-slate-400">No deposits.</div>
        ) : (
          <table className="w-full text-sm min-w-[420px]">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="text-left p-2 w-20">Date</th>
                <th className="text-left p-2">Description</th>
                <th className="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((t) => (
                <tr key={`dep-${t.id}`} className="border-t border-slate-800">
                  <td className="p-2">{t.date}</td>
                  <td className="p-2">{t.description}</td>
                  <td className="p-2 text-right text-emerald-400">
                    {money(t.amount)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-800 font-medium">
                <td className="p-2" colSpan={2}>
                  Total
                </td>
                <td className="p-2 text-right">{money(parsedDeposits)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
