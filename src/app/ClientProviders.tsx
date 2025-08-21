"use client";
import React from "react";
import { AuthProvider } from "./providers/AuthProvider";
import { CategoriesProvider } from "./providers/CategoriesProvider";
import { AliasesProvider } from "./providers/AliasesProvider";
import { ReconcilerProvider } from "./providers/ReconcilerProvider";
import { BrandMapProvider } from "./providers/BrandMapProvider";

// (If you already wrap with your other providers globally, include them here too)

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <CategoriesProvider>
        <AliasesProvider>
          <ReconcilerProvider>
            <BrandMapProvider>{children}</BrandMapProvider>
          </ReconcilerProvider>
        </AliasesProvider>
      </CategoriesProvider>
    </AuthProvider>
  );
}
