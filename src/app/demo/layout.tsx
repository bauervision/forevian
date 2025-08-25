// app/demo/layout.tsx
import type { Metadata } from "next";
import "../globals.css";
import Script from "next/script";
import { DEMO_MONTHS, DEMO_VERSION } from "./data";

export const metadata: Metadata = {
  title: "Forevian — Demo",
  description: "Interactive demo (no login required)",
  appleWebApp: { statusBarStyle: "black-translucent" },
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const demoJson = JSON.stringify(DEMO_MONTHS);

  return (
    <>
      {/* BEFORE HYDRATION in /demo: seed demo data into localStorage */}
      <Script id="demo-seed" strategy="beforeInteractive">
        {`
    (function () {
      try {
        var PATH = location.pathname || "";
        if (!PATH.startsWith("/demo")) return;

        var IDX_KEY = "reconciler.statements.index.v2";
        var CUR_KEY = "reconciler.statements.current.v2";
        var BK_IDX  = "demo:backup:index";
        var BK_CUR  = "demo:backup:current";
        var FLAG    = "demo:active";
        var VER_KEY = "demo:version";
        var NEW_VER = ${JSON.stringify(DEMO_VERSION)};
        var months  = ${JSON.stringify(DEMO_MONTHS)};

        var currentVer = localStorage.getItem(VER_KEY);
        var alreadyActive = localStorage.getItem(FLAG) === "1";

        // Reseed if not active OR version changed
        if (!alreadyActive || String(currentVer) !== String(NEW_VER)) {
          // backup real data once (only if not active yet)
          if (!alreadyActive) {
            localStorage.setItem(BK_IDX, localStorage.getItem(IDX_KEY) ?? "");
            localStorage.setItem(BK_CUR, localStorage.getItem(CUR_KEY) ?? "");
          }

          // build demo index
          var demoIndex = {};
          for (var i = 0; i < months.length; i++) {
            var m = months[i];
            demoIndex[m.id] = {
              id: m.id,
              label: m.label,
              stmtYear: m.stmtYear,
              stmtMonth: m.stmtMonth,
              pagesRaw: [],
              inputs: m.inputs || { beginningBalance: 0, totalDeposits: 0, totalWithdrawals: 0 },
              cachedTx: m.cachedTx
            };
          }

          // choose which month to open first
          var firstId = months.length ? months[0].id : "";

          localStorage.setItem(IDX_KEY, JSON.stringify(demoIndex));
          localStorage.setItem(CUR_KEY, firstId);
          localStorage.setItem(FLAG, "1");
          localStorage.setItem(VER_KEY, String(NEW_VER));
        }
      } catch (e) {
        console.error("Demo seed failed:", e);
      }
    })();
  `}
      </Script>

      {/* BEFORE HYDRATION when leaving /demo: restore user’s real data */}
      <Script id="demo-restore" strategy="beforeInteractive">
        {`
          (function () {
            try {
              var PATH = location.pathname || "";
              var IDX_KEY = "reconciler.statements.index.v2";
              var CUR_KEY = "reconciler.statements.current.v2";
              var BK_IDX  = "demo:backup:index";
              var BK_CUR  = "demo:backup:current";
              var FLAG    = "demo:active";

              if (PATH.startsWith("/demo")) return;
              if (localStorage.getItem(FLAG) !== "1") return;

              var idxBk = localStorage.getItem(BK_IDX);
              var curBk = localStorage.getItem(BK_CUR);

              if (idxBk !== null) localStorage.setItem(IDX_KEY, idxBk);
              else localStorage.removeItem(IDX_KEY);

              if (curBk !== null) localStorage.setItem(CUR_KEY, curBk);
              else localStorage.removeItem(CUR_KEY);

              localStorage.removeItem(BK_IDX);
              localStorage.removeItem(BK_CUR);
              localStorage.removeItem(FLAG);
            } catch (e) {
              console.error("Demo restore failed:", e);
            }
          })();
        `}
      </Script>

      {/* Banner sits inside the root layout's <main> */}
      <div className="w-full bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-sm">
        <div className="mx-auto max-w-6xl px-4 py-2">
          <strong>Demo Mode:</strong> sample data only; no login, no cloud
          writes.
        </div>
      </div>

      {/* Render demo children underneath; root layout already provides <html>/<body>/Navbar/Footer */}
      <div className="flex-grow pt-4">{children}</div>
    </>
  );
}
