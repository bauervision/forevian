export type NavLink = { href: string; label: string; requiresAuth?: boolean };
export const NAV_LINKS: NavLink[] = [
  { href: "/demo", label: "Demo" },
  { href: "/dashboard", label: "Dashboard", requiresAuth: true },
  { href: "/reconciler", label: "Reconciler", requiresAuth: true },
  { href: "/dashboard/category", label: "Categories", requiresAuth: true },
  { href: "/trends", label: "Trends", requiresAuth: true },
  { href: "/budget", label: "Budget", requiresAuth: true },
];
