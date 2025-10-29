export type NavLink = { href: string; label: string; requiresAuth?: boolean };
export const NAV_LINKS: NavLink[] = [
  { href: "/reconciler", label: "Reconciler", requiresAuth: true },
  { href: "/dashboard", label: "Dashboard", requiresAuth: true },
  { href: "/dashboard/category", label: "Categories", requiresAuth: true },
  { href: "/budget", label: "Budget", requiresAuth: true },
  { href: "/trends", label: "Trends", requiresAuth: true },
  { href: "/demo", label: "Demo" },
];
