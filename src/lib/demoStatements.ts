// app/demo/lib/demoStatements.ts
"use client";

import {
  type StatementSnapshot,
  emptyStatement,
  makeId,
  monthLabel,
} from "@/lib/statements";

/** Always use demo namespace */
const DEMO_PREFIX = "demo:";

/** Real app keys */
const IDX_KEY = "reconciler.statements.index.v2";
const CUR_KEY = "reconciler.statements.current.v2";

const hasWindow = () => typeof window !== "undefined";
const withPrefix = (key: string) => `${DEMO_PREFIX}${key}`;

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function useDemoStatements() {
  function readIndex(): Record<string, StatementSnapshot> {
    if (!hasWindow()) return {};
    return parseJson<Record<string, StatementSnapshot>>(
      localStorage.getItem(withPrefix(IDX_KEY)),
      {}
    );
  }

  function writeIndex(idx: Record<string, StatementSnapshot>) {
    if (!hasWindow()) return;
    localStorage.setItem(withPrefix(IDX_KEY), JSON.stringify(idx));
  }

  function readCurrentId(): string | null {
    if (!hasWindow()) return null;
    return localStorage.getItem(withPrefix(CUR_KEY));
  }

  function writeCurrentId(id: string) {
    if (!hasWindow()) return;
    localStorage.setItem(withPrefix(CUR_KEY), id);
  }

  function upsertStatement(s: StatementSnapshot) {
    if (!hasWindow()) return;
    const idx = readIndex();
    idx[s.id] = s;
    writeIndex(idx);
    writeCurrentId(s.id);
  }

  function removeStatement(id: string) {
    if (!hasWindow()) return;
    const idx = readIndex();
    delete idx[id];
    writeIndex(idx);
    if (readCurrentId() === id) {
      writeCurrentId(Object.keys(idx)[0] ?? "");
    }
  }

  function readStatement(id: string): StatementSnapshot | null {
    const idx = readIndex();
    return idx[id] ?? null;
  }

  function listStatements(): Array<{ id: string; label: string }> {
    return Object.values(readIndex()).map((s) => ({
      id: s.id,
      label: s.label,
    }));
  }

  return {
    emptyStatement,
    makeId,
    monthLabel,
    readIndex,
    writeIndex,
    readCurrentId,
    writeCurrentId,
    upsertStatement,
    removeStatement,
    readStatement,
    listStatements,
  };
}
