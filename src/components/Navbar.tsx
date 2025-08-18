"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "@/lib/nav";

export default function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-40 border-b bg-white/80 dark:bg-gray-950/70 backdrop-blur">
      <div className="mx-auto max-w-6xl h-12 px-4 flex items-center gap-4">
        <div className="font-semibold">Forevian</div>
        <ul className="flex items-center gap-1 text-sm">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname?.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`px-3 py-1.5 rounded
                    ${
                      active
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
