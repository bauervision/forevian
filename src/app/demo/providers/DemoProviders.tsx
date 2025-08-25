// app/demo/providers/DemoProviders.tsx
"use client";
import React from "react";
import ClientProviders from "@/app/ClientProviders";
import { DemoModeProvider } from "./DemoModeContext";

export default function DemoProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DemoModeProvider storagePrefix="demo:">
      <ClientProviders>{children}</ClientProviders>
    </DemoModeProvider>
  );
}
