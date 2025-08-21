"use client";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-gray-950 border-t border-gray-800 text-gray-400">
      <div className="mx-auto max-w-6xl px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Brand / About */}
        <div>
          <Link href="/" className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg border border-cyan-500/40 bg-gradient-to-br from-cyan-600/20 to-cyan-400/5 grid place-items-center">
              <span className="text-cyan-300 text-sm font-bold">F</span>
            </div>
            <span className="font-semibold tracking-tight text-white">
              Forevian<span className="text-cyan-400"> Finance</span>
            </span>
          </Link>
          <p className="text-sm leading-relaxed">
            Helping you take control of your finances with clarity, simplicity,
            and insight.
          </p>
        </div>

        {/* Links */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-4">Navigation</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/dashboard" className="hover:text-cyan-400">
                Dashboard
              </Link>
            </li>
            <li>
              <Link href="/reconciler" className="hover:text-cyan-400">
                Reconciler
              </Link>
            </li>
            <li>
              <Link href="/categories" className="hover:text-cyan-400">
                Categories
              </Link>
            </li>
            <li>
              <Link href="/reports" className="hover:text-cyan-400">
                Reports
              </Link>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-4">Legal</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/privacy" className="hover:text-cyan-400">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-cyan-400">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/security" className="hover:text-cyan-400">
                Security
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800 py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} Forevian Finance. All rights reserved.
      </div>
    </footer>
  );
}
