"use client";
import React from "react";
import {
  Brain,
  MessageCircle,
  ShoppingCart,
  Utensils,
  Fuel,
  Home,
  Shield,
  Cable,
  MonitorPlay,
  CreditCard,
  ShoppingBag,
  PiggyBank,
  Music,
  Store,
  Sparkles,
  Stethoscope,
} from "lucide-react";

export type IconKey =
  | "medical"
  | "therapist"
  | "groceries"
  | "dining"
  | "fuel"
  | "utilities"
  | "insurance"
  | "subscriptions"
  | "shopping"
  | "debt"
  | "entertainment"
  | "kids"
  | "impulse"
  | "generic";

export function IconFromKey({
  icon,
  className = "h-5 w-5",
}: {
  icon: IconKey;
  className?: string;
}) {
  switch (icon) {
    case "medical":
      return <Stethoscope className={className} />;
    case "therapist":
      return <Brain className={className} />;
    case "groceries":
      return <ShoppingCart className={className} />;
    case "dining":
      return <Utensils className={className} />;
    case "fuel":
      return <Fuel className={className} />;
    case "utilities":
      return <Cable className={className} />;
    case "insurance":
      return <Shield className={className} />;
    case "subscriptions":
      return <MonitorPlay className={className} />;
    case "shopping":
      return <ShoppingBag className={className} />;
    case "debt":
      return <CreditCard className={className} />;
    case "entertainment":
      return <Music className={className} />;
    case "kids":
      return <Home className={className} />;
    case "impulse":
      return <Sparkles className={className} />;
    default:
      return <Store className={className} />;
  }
}

/** Category → icon (fallback when no logo/override) */
export function iconForCategory(catName: string, className = "h-5 w-5") {
  const c = (catName || "").toLowerCase();
  if (/medical|doctor|clinic|hospital|health|pharmacy/.test(c))
    return <Stethoscope className={className} />;
  if (
    /therapy|therapist|counsel(l)?ing|psych(ology|iatry|otherapist)|mental\s*health/.test(
      c
    )
  )
    return <Brain className={className} />;
  if (/grocer/.test(c)) return <ShoppingCart className={className} />;
  if (/fast\s*food|dining|restaurant|coffee|food/.test(c))
    return <Utensils className={className} />;
  if (/gas|fuel/.test(c)) return <Fuel className={className} />;
  if (/housing|mortgage|rent|home/.test(c))
    return <Home className={className} />;
  if (/utilities?/.test(c)) return <Cable className={className} />;
  if (/insurance/.test(c)) return <Shield className={className} />;
  if (/subscriptions?|stream|music|video|plus|netflix|hulu|disney/.test(c))
    return <MonitorPlay className={className} />;
  if (/amazon|shopping|household|target|depot|store/.test(c))
    return <ShoppingBag className={className} />;
  if (/debt|loan|credit\s*card/.test(c))
    return <CreditCard className={className} />;
  if (/cash\s*back/.test(c)) return <PiggyBank className={className} />;
  if (/entertainment|movies|cinema/.test(c))
    return <Music className={className} />;
  if (/impulse|misc|uncategorized|other/.test(c))
    return <Sparkles className={className} />;
  return <Store className={className} />;
}

export const ICON_KEYS: readonly IconKey[] = [
  "medical",
  "groceries",
  "dining",
  "fuel",
  "utilities",
  "insurance",
  "subscriptions",
  "shopping",
  "debt",
  "entertainment",
  "kids",
  "impulse",
  "generic",
] as const;

export function isIconKey(x: unknown): x is IconKey {
  return typeof x === "string" && (ICON_KEYS as readonly string[]).includes(x);
}
