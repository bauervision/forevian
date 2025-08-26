// app/demo/layout.tsx
import type { Metadata } from "next";
import "../globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ClientProviders from "@/app/ClientProviders";
import Script from "next/script";
import { DEMO_MONTHS, DEMO_VERSION } from "./data";
import DemoStatementsBootstrap from "@/components/DemoStatementBootstrap";
import DemoCategoriesBootstrap from "@/components/DemoCategoriesBootstrap";

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
  // Serialize demo data for the inline script (must be JSON-safe)
  const demoJson = JSON.stringify(DEMO_MONTHS);
  const demoVersion = JSON.stringify(String(DEMO_VERSION ?? "1"));

  return (
    <>
      {/* 1) BEFORE HYDRATION: If we're on /demo, BACKUP real data (once) and SEED demo data */}
      <Script id="demo-backup-and-seed" strategy="beforeInteractive">
        {`
            (function () {
              try {
                var PATH = location.pathname || "";
                if (!PATH.startsWith("/demo")) return;

                // --- keys
                var IDX_KEY = "reconciler.statements.index.v2";
                var CUR_KEY = "reconciler.statements.current.v2";
                var CATS_KEY = "categories.all.v1";   // <-- change if your CategoriesProvider uses a different key
                var RULES_KEY = "category.rules.v2";  // <-- change if your category rules store uses a different key

                // --- backup keys + flags
                var BK_IDX  = "demo:backup:index";
                var BK_CUR  = "demo:backup:current";
                var BK_CATS = "demo:backup:categories";
                var BK_RULES= "demo:backup:catrules";

                var FLAG_ACTIVE  = "demo:active";
                var FLAG_VERSION = "demo:version";

                var alreadyActive = localStorage.getItem(FLAG_ACTIVE) === "1";
                var oldVersion = localStorage.getItem(FLAG_VERSION);
                var newVersion = ${demoVersion};

                // Only reseed if version changed; otherwise do nothing if already active
                if (alreadyActive && oldVersion === newVersion) return;

                // Backup real data (only on first activation; keep backups if reseeding to a new version)
                if (!alreadyActive) {
                  localStorage.setItem(BK_IDX,  localStorage.getItem(IDX_KEY)  ?? "");
                  localStorage.setItem(BK_CUR,  localStorage.getItem(CUR_KEY)  ?? "");
                  localStorage.setItem(BK_CATS, localStorage.getItem(CATS_KEY) ?? "");
                  localStorage.setItem(BK_RULES,localStorage.getItem(RULES_KEY)?? "");
                }

                // Build demo index from serialized months
                var months = ${demoJson};
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
                    cachedTx: m.cachedTx || []
                  };
                }
                localStorage.setItem(IDX_KEY, JSON.stringify(demoIndex));
                var last = months.length ? months[months.length - 1].id : "";
                localStorage.setItem(CUR_KEY, last);

                // Derive demo categories from the demo months so dialogs show a relevant list
                var catSet = new Set();
                for (var j = 0; j < months.length; j++) {
                  var rows = months[j].cachedTx || [];
                  for (var k = 0; k < rows.length; k++) {
                    var c = (rows[k].categoryOverride || rows[k].category || "").trim();
                    if (c) catSet.add(c);
                  }
                }
                var cats = Array.from(catSet);
                // Keep 'Uncategorized' last if present
                var uncI = cats.findIndex(function (x) { return String(x).toLowerCase() === "uncategorized"; });
                if (uncI >= 0) {
                  var u = cats.splice(uncI, 1)[0];
                  cats.push(u === "Uncategorized" ? u : "Uncategorized");
                }
                localStorage.setItem(CATS_KEY, JSON.stringify(cats));

                // (Optional) If you want demo rules pre-populated, set RULES_KEY here:
                // localStorage.setItem(RULES_KEY, JSON.stringify([{ name: "Amazon", domain: "amazon.com", enabled: true }]));

                // Mark demo active & pin version
                localStorage.setItem(FLAG_ACTIVE, "1");
                localStorage.setItem(FLAG_VERSION, newVersion);
              } catch (e) {
                console.error("Demo seed failed:", e);
              }
            })();
          `}
      </Script>

      {/* 2) BEFORE HYDRATION: If we LEFT /demo and demo was active, RESTORE backups & clear flags */}
      <Script id="demo-restore-on-exit" strategy="beforeInteractive">
        {`
            (function () {
              try {
                var PATH = location.pathname || "";
                if (PATH.startsWith("/demo")) return;

                var FLAG_ACTIVE  = "demo:active";
                var FLAG_VERSION = "demo:version";
                if (localStorage.getItem(FLAG_ACTIVE) !== "1") return;

                // --- keys
                var IDX_KEY = "reconciler.statements.index.v2";
                var CUR_KEY = "reconciler.statements.current.v2";
                var CATS_KEY = "categories.all.v1";   // <-- change if your CategoriesProvider uses a different key
                var RULES_KEY = "category.rules.v2";  // <-- change if your category rules store uses a different key

                // --- backup keys
                var BK_IDX  = "demo:backup:index";
                var BK_CUR  = "demo:backup:current";
                var BK_CATS = "demo:backup:categories";
                var BK_RULES= "demo:backup:catrules";

                // Restore original values if we have them; otherwise remove demo values
                var idxBk   = localStorage.getItem(BK_IDX);
                var curBk   = localStorage.getItem(BK_CUR);
                var catsBk  = localStorage.getItem(BK_CATS);
                var rulesBk = localStorage.getItem(BK_RULES);

                if (idxBk !== null) localStorage.setItem(IDX_KEY, idxBk); else localStorage.removeItem(IDX_KEY);
                if (curBk !== null) localStorage.setItem(CUR_KEY, curBk); else localStorage.removeItem(CUR_KEY);
                if (catsBk !== null) localStorage.setItem(CATS_KEY, catsBk); else localStorage.removeItem(CATS_KEY);
                if (rulesBk !== null) localStorage.setItem(RULES_KEY, rulesBk); else localStorage.removeItem(RULES_KEY);

                // Clear backups & flags
                localStorage.removeItem(BK_IDX);
                localStorage.removeItem(BK_CUR);
                localStorage.removeItem(BK_CATS);
                localStorage.removeItem(BK_RULES);
                localStorage.removeItem(FLAG_ACTIVE);
                localStorage.removeItem(FLAG_VERSION);
              } catch (e) {
                console.error("Demo restore failed:", e);
              }
            })();
          `}
      </Script>

      {/* Demo banner */}
      <div className="w-full bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-sm">
        <div className="mx-auto max-w-6xl px-4 py-2">
          <strong>Demo Mode:</strong> sample data only; no login, no cloud
          writes.
        </div>
      </div>

      {/* children render after storage was swapped */}
      <DemoStatementsBootstrap />
      <DemoCategoriesBootstrap />
      <div className="flex-grow pt-4">{children}</div>
    </>
  );
}
