"use client";
import * as React from "react";
import {
  useCategories,
  type Category,
} from "@/app/providers/CategoriesProvider";
import CategoryManagerDialog from "@/components/CategoryManagerDialog";

type Props = {
  /** Category identity should be the slug */
  value: string; // slug
  onChange: (slug: string) => void;
  disabled?: boolean;
};

function CategorySelect({ value, onChange, disabled = false }: Props) {
  const { categories, findBySlug, findByNameCI } = useCategories();
  const [openMgr, setOpenMgr] = React.useState(false);
  const selectRef = React.useRef<HTMLSelectElement>(null);
  const beforeSlugsRef = React.useRef<string[] | null>(null);
  const [awaitingNew, setAwaitingNew] = React.useState(false);

  const list = React.useMemo(() => {
    const arr = [...categories];
    arr.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    const i = arr.findIndex((c) => c.name.toLowerCase() === "uncategorized");
    if (i >= 0) {
      const [u] = arr.splice(i, 1);
      arr.push(u);
    }
    return arr;
  }, [categories]);

  React.useEffect(() => {
    if (!value || findBySlug(value)) return;
    const legacy = findByNameCI(value);
    if (legacy) onChange(legacy.slug);
  }, [value, findBySlug, findByNameCI, onChange]);

  React.useEffect(() => {
    if (openMgr || !awaitingNew) return;
    setAwaitingNew(false);

    const before = new Set(beforeSlugsRef.current ?? []);
    beforeSlugsRef.current = null;

    const added = list.filter((c) => !before.has(c.slug));
    if (added.length > 0) {
      const pick =
        added.find((c) => c.name.toLowerCase() !== "uncategorized") ?? added[0];
      onChange(pick.slug);
      selectRef.current?.focus();
    }
  }, [openMgr, awaitingNew, list, onChange]);

  const renderLabel = (c: Category) =>
    c.icon ? `${c.icon} ${c.name}` : c.name;

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
              beforeSlugsRef.current = list.map((c) => c.slug);
              setAwaitingNew(true);
              setOpenMgr(true);
              return;
            }
            onChange(v);
          }}
          className="bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl px-2 py-1"
        >
          {list.map((c) => (
            <option key={c.slug} value={c.slug}>
              {renderLabel(c)}
            </option>
          ))}
          <option value="__ADD__">＋ Add Category…</option>
        </select>
      </div>

      {openMgr && (
        <CategoryManagerDialog
          open
          onClose={() => setOpenMgr(false)}
          onAdded={(cat) => {
            onChange(cat.slug);
            setTimeout(() => selectRef.current?.focus(), 0);
          }}
        />
      )}
    </>
  );
}

export default CategorySelect;
