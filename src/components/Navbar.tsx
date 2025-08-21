"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, LineChart, Menu, X, User as UserIcon } from "lucide-react";
import { useAuth } from "@/app/providers/AuthProvider";
// <- adjust if different

// Helper: active link style
function NavLink({
  href,
  children,
  onClick,
  active,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md transition-colors
        ${active ? "bg-white text-gray-900" : "text-white/90 hover:bg-white/10"}
        ${className}`}
    >
      {children}
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  // Hide on scroll down, show on scroll up
  React.useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > lastY && y > 8); // downwards after a tiny threshold
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu when route changes
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const protectedLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/reconciler", label: "Reconciler" },
    { href: "/dashboard/category", label: "Categories" },
  ];
  const publicLinks = [{ href: "/demo", label: "Demo" }];

  return (
    <>
      {/* Top bar */}
      <nav
        className={`fixed top-0 left-0 right-0 z-40 transition-transform duration-200
          ${hidden ? "-translate-y-full" : "translate-y-0"}`}
      >
        {/* full-width background */}
        <div className="w-full bg-gray-950/80 backdrop-blur border-b border-gray-800">
          {/* content container */}
          <div className="mx-auto max-w-6xl h-14 px-4 flex items-center justify-between">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-2 group">
              <div className="h-7 w-7 rounded-lg border border-cyan-500/40 bg-gradient-to-br from-cyan-600/20 to-cyan-400/5 grid place-items-center">
                <LineChart
                  className="h-4 w-4 text-cyan-300"
                  strokeWidth={2.5}
                />
              </div>
              <span className="font-semibold tracking-tight text-white">
                Forevian<span className="text-cyan-400"> Finance</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {user &&
                protectedLinks.map(({ href, label }) => (
                  <NavLink
                    key={href}
                    href={href}
                    active={pathname?.startsWith(href)}
                  >
                    {label}
                  </NavLink>
                ))}
              {publicLinks.map(({ href, label }) => (
                <NavLink key={href} href={href} active={pathname === href}>
                  {label}
                </NavLink>
              ))}

              {/* Right side auth */}
              <div className="ml-2">
                {loading ? null : user ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/5">
                      <UserIcon className="h-4 w-4 text-cyan-300" />
                      <span className="text-sm text-white/90">
                        {user.email ?? "Account"}
                      </span>
                    </div>
                    <button
                      onClick={() => signOut()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-red-500/40 text-red-300 hover:bg-red-900/20"
                      title="Sign out"
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="text-sm">Sign out</span>
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/login"
                    className="px-3 py-1.5 rounded-md bg-cyan-500 text-gray-900 font-semibold hover:bg-cyan-400"
                  >
                    Sign in / Join
                  </Link>
                )}
              </div>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md border border-white/20 text-white hover:bg-white/10"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile sheet + overlay */}
      {open && (
        <>
          {/* Dark overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/70"
            onClick={() => setOpen(false)}
          />
          {/* Full-height panel */}
          <div className="fixed top-0 left-0 right-0 z-50 h-screen w-full bg-gray-950/95 border-b border-gray-800 px-6 py-6">
            {/* Close row */}
            <div className="flex items-center justify-between">
              {/* Brand (again, per your request) */}
              <Link
                href="/"
                className="flex items-center gap-2"
                onClick={() => setOpen(false)}
              >
                <div className="h-7 w-7 rounded-lg border border-cyan-500/40 bg-gradient-to-br from-cyan-600/20 to-cyan-400/5 grid place-items-center">
                  <span className="text-cyan-300 text-sm font-bold">F</span>
                </div>
                <span className="font-semibold tracking-tight text-white">
                  Forevian<span className="text-cyan-400"> Finance</span>
                </span>
              </Link>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/20 text-white hover:bg-white/10"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Links (right-aligned, comfy tap targets) */}
            <nav className="mt-8 flex flex-col items-end gap-4">
              {user &&
                protectedLinks.map(({ href, label }) => (
                  <NavLink
                    key={href}
                    href={href}
                    active={pathname?.startsWith(href)}
                    onClick={() => setOpen(false)}
                    className="text-lg px-4 py-2"
                  >
                    {label}
                  </NavLink>
                ))}
              {publicLinks.map(({ href, label }) => (
                <NavLink
                  key={href}
                  href={href}
                  active={pathname === href}
                  onClick={() => setOpen(false)}
                  className="text-lg px-4 py-2"
                >
                  {label}
                </NavLink>
              ))}

              {/* Auth area */}
              <div className="pt-4">
                {loading ? null : user ? (
                  <button
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-red-500/40 text-red-300 hover:bg-red-900/20"
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="text-lg">Sign out</span>
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-cyan-500 text-gray-900 font-semibold hover:bg-cyan-400"
                  >
                    <UserIcon className="h-5 w-5" />
                    <span className="text-lg">Sign in / Join</span>
                  </Link>
                )}
              </div>
            </nav>
          </div>
        </>
      )}

      {/* Spacer so content isn't hidden under the fixed bar */}
      <div className="h-14" />
    </>
  );
}
