// providers/DemoModeContext.tsx
"use client";
import React, { createContext, useContext } from "react";

const DemoCtx = createContext({ isDemo: false });
export function DemoModeProvider({ children, isDemo = false }: any) {
  return <DemoCtx.Provider value={{ isDemo }}>{children}</DemoCtx.Provider>;
}
export function useDemoMode() {
  return useContext(DemoCtx);
}
