import * as React from "react";
import {
  useCategories,
  type Category,
} from "@/app/providers/CategoriesProvider";
import CategoryManagerDialog from "@/components/CategoryManagerDialog"; // assuming this path

function CategorySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string; // category NAME (legacy-friendly)
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { categories } = useCategories(); // Category[]
  const [openMgr, setOpenMgr] = React.useState(false);
  const selectRef = React.useRef<HTMLSelectElement>(null);

  // Track pre-open list (names) so we can detect what was added
  const beforeCatsRef = React.useRef<string[] | null>(null);
  const [awaitingNew, setAwaitingNew] = React.useState(false);

  // Utility: get list of names (case-insensitive Set helper)
  const namesCI = React.useMemo(() => {
    return categories.map((c) => c.name).filter(Boolean);
  }, [categories]);

  const sortedNames = React.useMemo(() => {
    const set = new Set(
      namesCI.map((n) => n.trim()).filter((n) => n.length > 0)
    );

    const inList = categories.some((c) => c.name === value);
    if (value && !inList) {
      // In demo, do not inject legacy label into the dropdown.
      // Outside demo, you can keep the old behavior if you like.
      const path =
        typeof window !== "undefined" ? window.location.pathname : "";
      const isDemo = path.startsWith("/demo");
      if (!isDemo) set.add(value);
    }

    const list = Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    // Keep “Uncategorized” last
    const i = list.findIndex((x) => x.toLowerCase() === "uncategorized");
    if (i >= 0) {
      const [u] = list.splice(i, 1);
      list.push(u === "Uncategorized" ? u : "Uncategorized");
    }
    return list;
  }, [namesCI, value]);

  // after the manager closes, detect newly-added label & apply it
  React.useEffect(() => {
    if (openMgr) return; // wait until dialog is closed
    if (!awaitingNew) return; // only if we opened via ＋ Add

    setAwaitingNew(false);

    const before = (beforeCatsRef.current ?? []).map((x) => x.toLowerCase());
    beforeCatsRef.current = null;

    const now = namesCI;
    const added = now.filter((n) => !before.includes(n.toLowerCase()));

    if (added.length > 0) {
      // Heuristic: pick the first non-"Uncategorized", else the first
      const pick =
        added.find((c) => c.toLowerCase() !== "uncategorized") ?? added[0];
      onChange(pick); // ✅ auto-assign the new category
      // re-focus select for UX
      selectRef.current?.focus();
    }
  }, [openMgr, awaitingNew, namesCI, onChange]);

  // Helper to render label with icon/hint (best-effort; <option> has limited styling)
  const renderOptionText = (name: string) => {
    const c = categories.find(
      (x) => x.name.toLowerCase() === name.toLowerCase()
    );
    if (!c) return name;
    const parts = [];
    if (c.icon) parts.push(`${c.icon} `);
    parts.push(c.name);
    return parts.join("");
  };

  // stable key for dialog re-mount on changes (avoid .join on objects)
  const mgrKey = React.useMemo(
    () =>
      `mgr-${categories.length}-` +
      categories
        .map((c) => c.name)
        .sort()
        .join("|"),
    [categories]
  );

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          ref={selectRef}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__ADD__") {
              // snapshot the list so we can diff later
              beforeCatsRef.current = [...namesCI];
              setAwaitingNew(true);
              setOpenMgr(true);
              return;
            }
            onChange(v);
          }}
          className="bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl px-2 py-1"
        >
          {sortedNames.map((opt) => (
            <option key={opt} value={opt}>
              {renderOptionText(opt)}
            </option>
          ))}
          <option value="__ADD__">＋ Add Category…</option>
        </select>
      </div>

      {openMgr && (
        <CategoryManagerDialog
          key={mgrKey}
          open
          onClose={() => setOpenMgr(false)}
          onAdded={(cat) => {
            onChange(cat.name); // ✅ auto-assign newly added
            // minor UX: re-focus the select so keyboard users can keep going
            setTimeout(() => selectRef.current?.focus(), 0);
          }}
        />
      )}
    </>
  );
}

export default CategorySelect;
