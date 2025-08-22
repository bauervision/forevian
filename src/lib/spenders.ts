// src/lib/spenders.ts
"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  useAuthUID,
  userDoc,
  setWithRev,
  subscribeDoc,
  debounce,
} from "@/lib/fx";

export type SpenderMap = Record<string, string>;

const LS_MAP_KEY = "ui.spenders.map.v1";
const LS_FLAGS_KEY = "ui.spenders.flags.v1";
const LEGACY_MAP_KEY = "ui.spenders.v1";

// NEW: canonicalizer (digits only, last 4, zero-pad)
const canonLast4 = (l4: string | number) => {
  const digits = String(l4 ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-4).padStart(4, "0");
};

type Flags = { singleUser: boolean; setupComplete: boolean };

function loadLocal(): { map: SpenderMap; flags: Flags } {
  // Try new keys
  try {
    const rawMap = localStorage.getItem(LS_MAP_KEY);
    const rawFlags = localStorage.getItem(LS_FLAGS_KEY);
    if (rawMap || rawFlags) {
      const mapRaw = rawMap ? JSON.parse(rawMap) : {};
      const normalized: SpenderMap = {};
      for (const [k, v] of Object.entries(mapRaw || {})) {
        const c = canonLast4(k);
        if (c) normalized[c] = (v as string) || "";
      }
      const f = rawFlags ? JSON.parse(rawFlags) : {};
      return {
        map: normalized,
        flags: {
          singleUser: !!f.singleUser,
          setupComplete: !!f.setupComplete,
        },
      };
    }
  } catch {}

  // LEGACY MIGRATION (old key)
  try {
    const legacy = localStorage.getItem(LEGACY_MAP_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as SpenderMap;
      const normalized: SpenderMap = {};
      for (const [k, v] of Object.entries(old || {})) {
        const c = canonLast4(k);
        if (c) normalized[c] = (v as string) || "";
      }
      const flags = { singleUser: false, setupComplete: false };
      localStorage.setItem(LS_MAP_KEY, JSON.stringify(normalized));
      localStorage.setItem(LS_FLAGS_KEY, JSON.stringify(flags));
      return { map: normalized, flags };
    }
  } catch {}

  return { map: {}, flags: { singleUser: false, setupComplete: false } };
}

function saveLocal(map: SpenderMap, flags: Flags) {
  try {
    localStorage.setItem(LS_MAP_KEY, JSON.stringify(map));
    localStorage.setItem(LS_FLAGS_KEY, JSON.stringify(flags));
  } catch {}
}

type RemoteDoc = {
  map?: SpenderMap;
  singleUser?: boolean;
  setupComplete?: boolean;
  rev?: number;
};

export function useSpenders() {
  const uid = useAuthUID();
  const initial = loadLocal();

  const [map, setMap] = useState<SpenderMap>(initial.map);
  const [singleUser, _setSingleUser] = useState<boolean>(
    initial.flags.singleUser
  );
  const [setupComplete, _setSetupComplete] = useState<boolean>(
    initial.flags.setupComplete
  );
  const [ready, setReady] = useState<boolean>(true);

  useEffect(() => {
    if (!uid) {
      setReady(true);
      return;
    }
    const ref = userDoc(uid, "settings", "spenders");
    return subscribeDoc<RemoteDoc>(ref, (data) => {
      // Normalize incoming map keys
      const incomingRaw = (data?.map as SpenderMap) ?? {};
      const normalized: SpenderMap = {};
      for (const [k, v] of Object.entries(incomingRaw)) {
        const c = canonLast4(k);
        if (c) normalized[c] = (v as string) || "";
      }

      setMap((prev) => {
        const same = JSON.stringify(prev) === JSON.stringify(normalized);
        return same ? prev : normalized;
      });
      _setSingleUser(!!data?.singleUser);
      _setSetupComplete(!!data?.setupComplete);
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const saveRemote = useMemo(
    () =>
      debounce(async (payload: RemoteDoc) => {
        if (!uid) return;
        const ref = userDoc(uid, "settings", "spenders");
        const safe: RemoteDoc = {
          map: payload.map ?? {},
          singleUser: !!payload.singleUser,
          setupComplete: !!payload.setupComplete,
        };
        await setWithRev(ref, safe);
      }, 400),
    [uid]
  );

  useEffect(() => {
    const flags: Flags = { singleUser, setupComplete };
    saveLocal(map, flags);
    saveRemote({ map, singleUser, setupComplete });
  }, [map, singleUser, setupComplete, saveRemote]);

  // Use canon on set
  const setSpender = useCallback((last4: string, name: string) => {
    const key = canonLast4(last4);
    if (!key) return;
    setMap((prev) => ({ ...prev, [key]: (name || "").trim() || "Joint" }));
  }, []);

  const removeSpender = useCallback((last4: string) => {
    const key = canonLast4(last4);
    if (!key) return;
    setMap((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const setAll = useCallback((next: React.SetStateAction<SpenderMap>) => {
    setMap(next as any);
  }, []);

  const setSingleUser = useCallback((v: boolean) => {
    _setSingleUser(!!v);
  }, []);

  const confirmSetup = useCallback(() => {
    _setSetupComplete(true);
  }, []);

  // Optional helper if you want to look up safely from any component
  const getNameFor = useCallback(
    (last4: string | number) => map[canonLast4(last4)] || "",
    [map]
  );

  return {
    map,
    singleUser,
    setupComplete,
    ready,
    setSpender,
    removeSpender,
    setAll,
    setSingleUser,
    confirmSetup,
    getNameFor, // optional
  };
}
