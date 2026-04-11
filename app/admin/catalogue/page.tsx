"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { adminFetch } from "lib/admin/fetch";

interface AdminProduct {
  id: string;
  title: string;
  handle: string;
  name?: string;
  slug?: string;
  type?: string | null;
  sku: string | null;
  parent_sku?: string | null;
  family_role?: string | null;
  stock_quantity?: number | null;
  stock_status?: string | null;
  supplier_ref?: string | null;
  supplier_code?: string | null;
  supplier_price?: number | null;
  tax_status?: string | null;
  tax_class?: string | null;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  regular_price: number | null;
  sale_price?: number | null;
  status: string;
  featured_image_url: string | null;
  categories: string | null;
  short_description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  variant_count?: number;
  family_id?: string | null;
  family_name?: string | null;
  family_children_count?: number;
}

interface Category {
  id: string;
  name: string;
  slug?: string;
}

interface AdminVariant {
  id: string;
  sku: string | null;
  name: string;
  regular_price: number | null;
  sale_price: number | null;
  stock_quantity: number | null;
  stock_status: string;
  status: string;
  variant_attributes?: Array<{
    attribute_name: string;
    attribute_value: string;
  }>;
}

type ColumnKey =
  | "image"
  | "title"
  | "sku"
  | "family"
  | "price"
  | "stock"
  | "supplier"
  | "status"
  | "seo"
  | "actions";

interface SavedView {
  id: string;
  name: string;
  search: string;
  statusFilter: string;
  categoryFilter: string;
  minPrice: string;
  maxPrice: string;
  missingDesc: boolean;
  visibleColumns: ColumnKey[];
}

interface UndoEntry {
  id: string;
  field: string;
  prev: unknown;
  next: unknown;
}

interface PasteRow {
  product: AdminProduct;
  changes: Record<string, string | number>;
  ignored: Record<string, string>; // field → reason
}

const PAGE_SIZE = 100;
const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = [
  "image",
  "title",
  "sku",
  "family",
  "price",
  "stock",
  "status",
  "seo",
  "actions",
];
const VIEWS_STORAGE_KEY = "prodes_catalog_excel_views";
const UNDO_MAX = 50;

// Editable columns for paste matrix (in order)
const PASTE_COLUMN_MAP: Array<{
  field: keyof AdminProduct;
  label: string;
  type: "text" | "number" | "status";
}> = [
  { field: "name", label: "Titre", type: "text" },
  { field: "sku", label: "SKU", type: "text" },
  { field: "regular_price", label: "Prix HT", type: "number" },
  { field: "status", label: "Statut", type: "status" },
];

const BULK_FIELD_OPTIONS = [
  { id: "regular_price", label: "Prix HT (€)", type: "number" },
  { id: "sale_price", label: "Prix promo (€)", type: "number" },
  { id: "status", label: "Statut", type: "select" },
  { id: "stock_quantity", label: "Stock qty", type: "number" },
  { id: "stock_status", label: "Stock status", type: "text" },
  { id: "supplier_ref", label: "Supplier ref", type: "text" },
  { id: "supplier_price", label: "Supplier price", type: "number" },
  { id: "parent_sku", label: "parent_sku", type: "text" },
  { id: "family_role", label: "family_role", type: "text" },
  { id: "short_description", label: "Desc. courte", type: "text" },
  { id: "seo_title", label: "SEO title", type: "text" },
  { id: "seo_description", label: "SEO description", type: "text" },
];

const STATUS_OPTIONS = [
  { id: "publish", label: "Publié" },
  { id: "draft", label: "Brouillon" },
  { id: "private", label: "Privé" },
];

const VALID_STATUSES = new Set(["publish", "draft", "private"]);

function seoScore(p: AdminProduct): number {
  const title = p.name || p.title || "";
  let score = 0;
  if (title && title.length >= 30 && title.length <= 70) score += 20;
  if (p.sku) score += 20;
  if (p.featured_image_url) score += 20;
  if ((p.regular_price ?? 0) > 0) score += 20;
  if (p.categories) score += 20;
  return score;
}

function SeoVoyant({ score }: { score: number }) {
  const color =
    score >= 90
      ? "text-green-600"
      : score >= 70
        ? "text-yellow-500"
        : score >= 40
          ? "text-orange-500"
          : "text-red-600";
  return (
    <span
      className={`font-mono text-xs font-semibold ${color}`}
      title={`Score SEO : ${score}/100`}
    >
      ● {score}
    </span>
  );
}

function EditableCell({
  value,
  type = "text",
  dirty = false,
  error = false,
  onSave,
}: {
  value: string | number;
  type?: "text" | "number";
  dirty?: boolean;
  error?: boolean;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cellError, setCellError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  // Sync draft when value changes externally (e.g., undo)
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = async () => {
    if (draft === String(value)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setCellError(false);
    try {
      await onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setCellError(true);
      setTimeout(() => setCellError(false), 2000);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded border border-blue-400 px-1 py-0.5 text-xs outline-none ring-1 ring-blue-400"
      />
    );
  }

  return (
    <span
      onDoubleClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={`block cursor-text rounded px-1 py-0.5 text-xs transition-colors hover:bg-gray-100 ${
        saving ? "bg-blue-50 text-blue-700" : ""
      } ${saved ? "bg-green-50 text-green-700" : ""} ${cellError || error ? "bg-red-50 text-red-700 ring-1 ring-red-400" : ""} ${
        dirty && !saving && !saved ? "bg-amber-50 ring-1 ring-amber-300" : ""
      }`}
      title="Double-clic pour éditer"
    >
      {value || <span className="text-gray-300">—</span>}
      {dirty && !saving && !saved && (
        <span className="ml-1 text-amber-500">●</span>
      )}
    </span>
  );
}

function SelectCell({
  value,
  options,
  dirty = false,
  onSave,
}: {
  value: string;
  options: { id: string; label: string }[];
  dirty?: boolean;
  onSave: (v: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSaving(true);
    try {
      await onSave(e.target.value);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={saving}
      className={`w-full rounded border px-1.5 py-0.5 text-xs focus:outline-none ${
        saved
          ? "border-green-400 bg-green-50"
          : dirty
            ? "border-amber-400 bg-amber-50"
            : "border-gray-200"
      } disabled:opacity-50`}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── CSV Export ─────────────────────────────────────────────────
function exportToCsv(
  products: AdminProduct[],
  dirtyRows: Map<string, Partial<AdminProduct>>,
  visibleColumns: Set<ColumnKey>,
) {
  const rows: AdminProduct[] = products.map((p) => ({
    ...p,
    ...(dirtyRows.get(p.id) ?? {}),
  }));

  // Only export fields corresponding to visible columns
  const allHeaders = [
    "id",
    "sku",
    "title",
    "handle",
    "type",
    "family_role",
    "parent_sku",
    "variant_count",
    "family_name",
    "regular_price",
    "sale_price",
    "stock_quantity",
    "stock_status",
    "supplier_ref",
    "supplier_price",
    "tax_status",
    "tax_class",
    "weight",
    "length",
    "width",
    "height",
    "status",
    "categories",
    "short_description",
    "seo_title",
    "seo_description",
  ];
  const colToFields: Record<ColumnKey, string[]> = {
    image: [],
    title: ["title", "handle"],
    sku: ["sku"],
    family: [
      "family_role",
      "parent_sku",
      "type",
      "variant_count",
      "family_name",
    ],
    price: ["regular_price", "sale_price"],
    stock: ["stock_quantity", "stock_status", "tax_status", "tax_class"],
    supplier: ["supplier_ref", "supplier_price", "supplier_code"],
    status: ["status"],
    seo: ["seo_title", "seo_description"],
    actions: [],
  };
  const exportedFields = new Set<string>(["id"]);
  for (const col of visibleColumns) {
    for (const f of colToFields[col] ?? []) exportedFields.add(f);
  }
  const headers = allHeaders.filter((h) => exportedFields.has(h));

  const csvContent = [
    headers.join(";"),
    ...rows.map((p) =>
      headers
        .map((h) => {
          const v = (p as unknown as Record<string, unknown>)[h];
          const s = v == null ? "" : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(";"),
    ),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `catalogue-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Parse TSV Paste ─────────────────────────────────────────────
function parseTSVPaste(
  raw: string,
  selectedProducts: AdminProduct[],
  visibleColumns: Set<ColumnKey>,
): { rows: PasteRow[]; recognized: number; applied: number; ignored: number } {
  const lines = raw.trim().split(/\r?\n/);
  // Which editable columns are visible (in order)?
  const activeCols = PASTE_COLUMN_MAP.filter((c) => {
    if (c.field === "name") return visibleColumns.has("title");
    if (c.field === "sku") return visibleColumns.has("sku");
    if (c.field === "regular_price") return visibleColumns.has("price");
    if (c.field === "status") return visibleColumns.has("status");
    return false;
  });

  const rows: PasteRow[] = [];
  let appliedTotal = 0;
  let ignoredTotal = 0;

  for (let i = 0; i < Math.min(lines.length, selectedProducts.length); i++) {
    const cells = lines[i]!.split("\t");
    const product = selectedProducts[i]!;
    const changes: Record<string, string | number> = {};
    const ignored: Record<string, string> = {};

    for (let j = 0; j < Math.min(cells.length, activeCols.length); j++) {
      const col = activeCols[j]!;
      const rawVal = cells[j]!.trim();

      if (col.type === "number") {
        const n = parseFloat(rawVal.replace(",", "."));
        if (isNaN(n) || n < 0) {
          ignored[col.field] = `"${rawVal}" non numérique`;
          ignoredTotal++;
        } else {
          changes[col.field] = Math.round(n * 100) / 100;
          appliedTotal++;
        }
      } else if (col.type === "status") {
        const normalized = rawVal.toLowerCase();
        const mapped =
          normalized === "publié" || normalized === "publish"
            ? "publish"
            : normalized === "brouillon" || normalized === "draft"
              ? "draft"
              : null;
        if (!mapped || !VALID_STATUSES.has(mapped)) {
          ignored[col.field] = `"${rawVal}" invalide (publish/draft attendu)`;
          ignoredTotal++;
        } else {
          changes[col.field] = mapped;
          appliedTotal++;
        }
      } else {
        // text
        if (rawVal !== "") {
          changes[col.field] = rawVal;
          appliedTotal++;
        }
      }
    }

    rows.push({ product, changes, ignored });
  }

  return {
    rows,
    recognized: lines.length,
    applied: appliedTotal,
    ignored: ignoredTotal,
  };
}

// ── Safe localStorage ───────────────────────────────────────────
function safeLsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}
function safeLsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// ── Main Component ─────────────────────────────────────────────
export default function CataloguePage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minPriceFilter, setMinPriceFilter] = useState("");
  const [maxPriceFilter, setMaxPriceFilter] = useState("");
  const [missingDescFilter, setMissingDescFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(DEFAULT_VISIBLE_COLUMNS),
  );
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState("");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editingViewName, setEditingViewName] = useState("");

  // Bulk status action
  const [bulkAction, setBulkAction] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Bulk field set
  const [bulkField, setBulkField] = useState("");
  const [bulkFieldValue, setBulkFieldValue] = useState("");
  const [bulkFieldLoading, setBulkFieldLoading] = useState(false);
  const [bulkFieldApplied, setBulkFieldApplied] = useState(0);

  // Formula
  const [formulaField, setFormulaField] = useState("regular_price");
  const [formulaOp, setFormulaOp] = useState("set");
  const [formulaValue, setFormulaValue] = useState("");
  const [formulaTextFrom, setFormulaTextFrom] = useState("");
  const [formulaTextTo, setFormulaTextTo] = useState("");
  const [formulaApplied, setFormulaApplied] = useState(0);

  // Fill down / clear
  const [fillField, setFillField] = useState("regular_price");
  const [fillResult, setFillResult] = useState(0);

  // Dirty rows
  const [dirtyRows, setDirtyRows] = useState<
    Map<string, Partial<AdminProduct>>
  >(new Map());
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [saveAllResult, setSaveAllResult] = useState<{
    ok: number;
    fail: number;
  } | null>(null);
  const [errorRows, setErrorRows] = useState<Set<string>>(new Set());

  // Show only dirty
  const [showOnlyDirty, setShowOnlyDirty] = useState(false);

  // Undo / redo
  const [undoHistory, setUndoHistory] = useState<UndoEntry[]>([]);
  const [redoHistory, setRedoHistory] = useState<UndoEntry[]>([]);

  // Server values for undo clean-detection
  const serverValuesRef = useRef<Map<string, Record<string, unknown>>>(
    new Map(),
  );

  // Paste matrix
  const [pasteMode, setPasteMode] = useState(false);
  const pasteTaRef = useRef<HTMLTextAreaElement>(null);
  const [pastePreview, setPastePreview] = useState<{
    rows: PasteRow[];
    recognized: number;
    applied: number;
    ignored: number;
  } | null>(null);
  const [expandedVariantRows, setExpandedVariantRows] = useState<Set<string>>(
    new Set(),
  );
  const [variantsByProduct, setVariantsByProduct] = useState<
    Map<string, AdminVariant[]>
  >(new Map());
  const [variantsLoadingByProduct, setVariantsLoadingByProduct] = useState<
    Set<string>
  >(new Set());
  const [variantErrors, setVariantErrors] = useState<Map<string, string>>(
    new Map(),
  );

  // Duplicate detection
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [familyRoleFilter, setFamilyRoleFilter] = useState("");

  // ── Column toggle ────────────────────────────────────────────
  const toggleColumn = (col: ColumnKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  // ── View management ──────────────────────────────────────────
  const saveCurrentView = () => {
    const trimmed = viewName.trim();
    if (!trimmed) return;
    const id = `${Date.now()}`;
    const next: SavedView = {
      id,
      name: trimmed,
      search,
      statusFilter,
      categoryFilter,
      minPrice: minPriceFilter,
      maxPrice: maxPriceFilter,
      missingDesc: missingDescFilter,
      visibleColumns: [...visibleColumns],
    };
    const merged = [next, ...savedViews].slice(0, 12);
    setSavedViews(merged);
    setActiveViewId(id);
    setViewName("");
    safeLsSet(VIEWS_STORAGE_KEY, merged);
  };

  const applySavedView = (view: SavedView) => {
    setSearch(view.search);
    setStatusFilter(view.statusFilter);
    setCategoryFilter(view.categoryFilter);
    setMinPriceFilter(view.minPrice);
    setMaxPriceFilter(view.maxPrice);
    setMissingDescFilter(view.missingDesc);
    setVisibleColumns(
      new Set(
        view.visibleColumns.length > 0
          ? view.visibleColumns
          : DEFAULT_VISIBLE_COLUMNS,
      ),
    );
    setPage(0);
    setActiveViewId(view.id);
  };

  const deleteSavedView = (id: string) => {
    const merged = savedViews.filter((v) => v.id !== id);
    setSavedViews(merged);
    if (activeViewId === id) setActiveViewId(null);
    safeLsSet(VIEWS_STORAGE_KEY, merged);
  };

  const duplicateView = (view: SavedView) => {
    const id = `${Date.now()}`;
    const copy: SavedView = { ...view, id, name: `${view.name} (copie)` };
    const merged = [...savedViews, copy].slice(0, 12);
    setSavedViews(merged);
    safeLsSet(VIEWS_STORAGE_KEY, merged);
  };

  const startRenameView = (view: SavedView) => {
    setEditingViewId(view.id);
    setEditingViewName(view.name);
  };

  const commitRenameView = (id: string) => {
    const trimmed = editingViewName.trim();
    if (!trimmed) {
      setEditingViewId(null);
      return;
    }
    const merged = savedViews.map((v) =>
      v.id === id ? { ...v, name: trimmed } : v,
    );
    setSavedViews(merged);
    safeLsSet(VIEWS_STORAGE_KEY, merged);
    setEditingViewId(null);
  };

  // ── Core: local change + undo tracking ──────────────────────
  const setLocalChange = useCallback(
    (id: string, field: string, value: string | number, skipUndo = false) => {
      if (!skipUndo) {
        setProducts((current) => {
          const prod = current.find((p) => p.id === id);
          setDirtyRows((currentDirty) => {
            const existingDirty = currentDirty.get(id);
            const prevValue: unknown =
              existingDirty &&
              field in (existingDirty as Record<string, unknown>)
                ? (existingDirty as Record<string, unknown>)[field]
                : prod
                  ? (prod as unknown as Record<string, unknown>)[field]
                  : undefined;

            setUndoHistory((h) => [
              ...h.slice(-(UNDO_MAX - 1)),
              { id, field, prev: prevValue, next: value },
            ]);
            setRedoHistory([]);

            const next = new Map(currentDirty);
            next.set(id, { ...(existingDirty ?? {}), [field]: value });
            return next;
          });
          return current.map((p) => {
            if (p.id !== id) return p;
            if (field === "name")
              return { ...p, name: String(value), title: String(value) };
            return { ...p, [field]: value };
          });
        });
      } else {
        setDirtyRows((prev) => {
          const next = new Map(prev);
          const existing = next.get(id) ?? {};

          // Check if reverting to server value
          const serverVal = serverValuesRef.current.get(id)?.[field];
          if (value === serverVal) {
            const { [field]: _removed, ...rest } = existing as Record<
              string,
              unknown
            >;
            if (Object.keys(rest).length === 0) next.delete(id);
            else next.set(id, rest as Partial<AdminProduct>);
          } else {
            next.set(id, { ...existing, [field]: value });
          }
          return next;
        });
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== id) return p;
            if (field === "name")
              return { ...p, name: String(value), title: String(value) };
            return { ...p, [field]: value };
          }),
        );
      }
    },
    [],
  );

  const undo = useCallback(() => {
    setUndoHistory((h) => {
      if (h.length === 0) return h;
      const entry = h[h.length - 1]!;
      setRedoHistory((r) => [...r, entry]);
      const prevVal = entry.prev;
      // Restore previous value (or clean up dirty if it was the server value)
      if (prevVal === undefined) {
        // Field wasn't dirty — remove from dirtyRows
        setDirtyRows((d) => {
          const next = new Map(d);
          const existing = next.get(entry.id);
          if (existing) {
            const { [entry.field]: _removed, ...rest } = existing as Record<
              string,
              unknown
            >;
            if (Object.keys(rest).length === 0) next.delete(entry.id);
            else next.set(entry.id, rest as Partial<AdminProduct>);
          }
          return next;
        });
        // Restore server value in products
        const serverVal = serverValuesRef.current.get(entry.id)?.[entry.field];
        if (serverVal !== undefined) {
          setProducts((p) =>
            p.map((prod) => {
              if (prod.id !== entry.id) return prod;
              if (entry.field === "name")
                return {
                  ...prod,
                  name: String(serverVal),
                  title: String(serverVal),
                };
              return { ...prod, [entry.field]: serverVal };
            }),
          );
        }
      } else {
        setLocalChange(entry.id, entry.field, prevVal as string | number, true);
      }
      return h.slice(0, -1);
    });
  }, [setLocalChange]);

  const redo = useCallback(() => {
    setRedoHistory((r) => {
      if (r.length === 0) return r;
      const entry = r[r.length - 1]!;
      setUndoHistory((h) => [...h, entry]);
      setLocalChange(
        entry.id,
        entry.field,
        entry.next as string | number,
        true,
      );
      return r.slice(0, -1);
    });
  }, [setLocalChange]);

  // ── Fetch products ──────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        search,
        status: statusFilter,
        limit: String(PAGE_SIZE),
      });
      if (categoryFilter) params.set("categoryId", categoryFilter);
      if (minPriceFilter) params.set("minPrice", minPriceFilter);
      if (maxPriceFilter) params.set("maxPrice", maxPriceFilter);
      if (missingDescFilter) params.set("missingDesc", "true");
      const res = await adminFetch(`/api/admin/products-list?${params}`);
      const data = await res.json();
      const prods: AdminProduct[] = data.products ?? [];
      setProducts(prods);
      setTotal(data.total ?? 0);
      // Seed server values for undo clean-detection
      const sv = new Map<string, Record<string, unknown>>();
      for (const p of prods)
        sv.set(p.id, p as unknown as Record<string, unknown>);
      serverValuesRef.current = sv;
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [
    categoryFilter,
    maxPriceFilter,
    minPriceFilter,
    missingDescFilter,
    page,
    search,
    statusFilter,
  ]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    adminFetch("/api/admin/ia/categories-list")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const views = safeLsGet<SavedView[]>(VIEWS_STORAGE_KEY, []);
    if (Array.isArray(views)) setSavedViews(views.slice(0, 12));
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "s") {
        e.preventDefault();
        if (dirtyRows.size > 0 && !saveAllLoading) saveAllDirty();
      }
      if (ctrl && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if (ctrl && ((e.shiftKey && e.key === "z") || e.key === "y")) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyRows.size, saveAllLoading]);

  // ── Individual patch (immediate save) ──────────────────────
  const patchProduct = useCallback(
    async (id: string, field: string, value: string | number | null) => {
      const res = await adminFetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                ...data.product,
                ...(typeof data.product?.name === "string"
                  ? { title: data.product.name }
                  : {}),
              }
            : p,
        ),
      );
      setDirtyRows((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setErrorRows((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [],
  );

  const loadVariants = useCallback(async (productId: string) => {
    setVariantsLoadingByProduct((prev) => {
      const next = new Set(prev);
      next.add(productId);
      return next;
    });
    setVariantErrors((prev) => {
      const next = new Map(prev);
      next.delete(productId);
      return next;
    });

    try {
      const res = await adminFetch(
        `/api/admin/products/${productId}/variations?page=1&limit=120`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error ?? "Impossible de charger les variantes");
      const rows = (data.variations ?? []) as AdminVariant[];
      setVariantsByProduct((prev) => {
        const next = new Map(prev);
        next.set(productId, rows);
        return next;
      });
    } catch (error) {
      setVariantErrors((prev) => {
        const next = new Map(prev);
        next.set(
          productId,
          error instanceof Error ? error.message : "Erreur variantes",
        );
        return next;
      });
    } finally {
      setVariantsLoadingByProduct((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }, []);

  const toggleVariantsRow = useCallback(
    (productId: string) => {
      setExpandedVariantRows((prev) => {
        const next = new Set(prev);
        if (next.has(productId)) {
          next.delete(productId);
        } else {
          next.add(productId);
        }
        return next;
      });

      const hasLoaded = variantsByProduct.has(productId);
      if (!hasLoaded) {
        void loadVariants(productId);
      }
    },
    [loadVariants, variantsByProduct],
  );

  const patchVariant = useCallback(
    async (
      productId: string,
      variantId: string,
      field: string,
      value: string | number | null,
    ) => {
      const res = await adminFetch(
        `/api/admin/products/${productId}/variations/${variantId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error ?? "Erreur de sauvegarde variante");
      const updated = (data.variation ?? {}) as Partial<AdminVariant>;
      setVariantsByProduct((prev) => {
        const next = new Map(prev);
        const rows = next.get(productId) ?? [];
        next.set(
          productId,
          rows.map((row) =>
            row.id === variantId ? { ...row, ...updated } : row,
          ),
        );
        return next;
      });
    },
    [],
  );

  // ── Save all dirty ──────────────────────────────────────────
  const saveAllDirty = useCallback(async () => {
    if (dirtyRows.size === 0) return;
    setSaveAllLoading(true);
    let ok = 0,
      fail = 0;
    const newErrors = new Set<string>();
    for (const [id, changes] of dirtyRows.entries()) {
      try {
        const res = await adminFetch(`/api/admin/products/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        if (res.ok) {
          ok++;
          setDirtyRows((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        } else {
          fail++;
          newErrors.add(id);
        }
      } catch {
        fail++;
        newErrors.add(id);
      }
    }
    setSaveAllLoading(false);
    setSaveAllResult({ ok, fail });
    setErrorRows(newErrors);
    if (fail === 0) {
      setUndoHistory([]);
      setRedoHistory([]);
    }
    setTimeout(() => setSaveAllResult(null), 4000);
  }, [dirtyRows]);

  // ── Bulk action ─────────────────────────────────────────────
  const handleBulkAction = async () => {
    if (!bulkAction || selected.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await adminFetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [...selected],
          action: bulkAction,
          value: bulkValue || undefined,
        }),
      });
      if (res.ok) {
        await fetchProducts();
        setSelected(new Set());
        setBulkAction("");
        setBulkValue("");
      }
    } catch {
      /* ignore */
    } finally {
      setBulkLoading(false);
    }
  };

  // ── Bulk field set ──────────────────────────────────────────
  const handleBulkFieldSet = async () => {
    if (!bulkField || bulkFieldValue === "" || selected.size === 0) return;
    setBulkFieldLoading(true);
    const fieldDef = BULK_FIELD_OPTIONS.find((f) => f.id === bulkField);
    const typedValue =
      fieldDef?.type === "number" ? parseFloat(bulkFieldValue) : bulkFieldValue;
    let count = 0;
    for (const id of selected) {
      setLocalChange(id, bulkField, typedValue);
      count++;
    }
    setBulkFieldApplied(count);
    setTimeout(() => setBulkFieldApplied(0), 2000);
    setBulkFieldLoading(false);
  };

  // ── Fill down ───────────────────────────────────────────────
  const fillDown = () => {
    const selectedArr = products.filter((p) => selected.has(p.id));
    if (selectedArr.length < 2 || !fillField) return;
    const sourceVal = (selectedArr[0] as unknown as Record<string, unknown>)[
      fillField
    ];
    if (sourceVal === undefined) return;
    let count = 0;
    for (const p of selectedArr.slice(1)) {
      setLocalChange(p.id, fillField, sourceVal as string | number);
      count++;
    }
    setFillResult(count);
    setTimeout(() => setFillResult(0), 2000);
  };

  // ── Clear field ─────────────────────────────────────────────
  const clearField = () => {
    if (selected.size === 0 || !fillField) return;
    let count = 0;
    for (const id of selected) {
      setLocalChange(id, fillField, "");
      count++;
    }
    setFillResult(count);
    setTimeout(() => setFillResult(0), 2000);
  };

  // ── Formula ────────────────────────────────────────────────
  const applyFormula = () => {
    if (selected.size === 0 || !formulaField) return;
    let count = 0;
    for (const id of selected) {
      const row = products.find((p) => p.id === id);
      if (!row) continue;

      if (
        [
          "regular_price",
          "sale_price",
          "stock_quantity",
          "supplier_price",
        ].includes(formulaField)
      ) {
        const currentRaw = (row as unknown as Record<string, unknown>)[
          formulaField
        ];
        const base = Number(currentRaw || 0);
        const n = Number(formulaValue || 0);
        let next = base;
        if (formulaOp === "set") next = n;
        if (formulaOp === "increase_pct") next = base * (1 + n / 100);
        if (formulaOp === "decrease_pct") next = base * (1 - n / 100);
        if (formulaOp === "increase_abs") next = base + n;
        if (formulaOp === "decrease_abs") next = base - n;
        if (!Number.isFinite(next)) continue;
        const normalized =
          formulaField === "stock_quantity"
            ? Math.max(0, Math.round(next))
            : Math.max(0, Math.round(next * 100) / 100);
        setLocalChange(id, formulaField, normalized);
        count++;
        continue;
      }

      const current = String(
        (row as unknown as Record<string, unknown>)[formulaField] ?? "",
      );
      let next = current;
      if (formulaOp === "set") next = formulaValue;
      if (formulaOp === "prepend") next = `${formulaValue}${current}`;
      if (formulaOp === "append") next = `${current}${formulaValue}`;
      if (formulaOp === "replace" && formulaTextFrom)
        next = current.replaceAll(formulaTextFrom, formulaTextTo);
      if (formulaOp === "trim") next = current.trim();
      setLocalChange(id, formulaField, next);
      count++;
    }
    setFormulaApplied(count);
    setTimeout(() => setFormulaApplied(0), 2000);
  };

  // ── Paste Matrix ────────────────────────────────────────────
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const raw = e.clipboardData.getData("text");
    const selectedProducts = products.filter((p) => selected.has(p.id));
    if (selectedProducts.length === 0) return;
    const result = parseTSVPaste(raw, selectedProducts, visibleColumns);
    setPastePreview(result);
  };

  const applyPastePreview = () => {
    if (!pastePreview) return;
    for (const row of pastePreview.rows) {
      for (const [field, value] of Object.entries(row.changes)) {
        setLocalChange(row.product.id, field, value);
      }
    }
    setPastePreview(null);
    setPasteMode(false);
  };

  // ── Selection helpers ───────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    const visible = showOnlyDirty
      ? products.filter((p) => dirtyRows.has(p.id))
      : products;
    setSelected(
      selected.size === visible.length
        ? new Set()
        : new Set(visible.map((p) => p.id)),
    );
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const dirtyCount = dirtyRows.size;
  const visibleColumnCount =
    1 + DEFAULT_VISIBLE_COLUMNS.filter((col) => visibleColumns.has(col)).length;

  // Duplicate SKU detection (client-side on current page)
  const { duplicateSkus, duplicateCount } = useMemo(() => {
    const skuCount = new Map<string, number>();
    for (const p of products) {
      if (p.sku) skuCount.set(p.sku, (skuCount.get(p.sku) ?? 0) + 1);
    }
    const dups = new Set<string>();
    for (const [sku, count] of skuCount.entries()) {
      if (count > 1) dups.add(sku);
    }
    return { duplicateSkus: dups, duplicateCount: dups.size };
  }, [products]);

  const displayedProducts = useMemo(() => {
    let list = showOnlyDirty
      ? products.filter((p) => dirtyRows.has(p.id))
      : products;
    if (showDuplicates) {
      list = list.filter((p) => p.sku && duplicateSkus.has(p.sku));
    }
    if (familyRoleFilter) {
      if (familyRoleFilter === "none") {
        list = list.filter((p) => !p.family_role);
      } else {
        list = list.filter((p) => p.family_role === familyRoleFilter);
      }
    }
    return list;
  }, [
    products,
    showOnlyDirty,
    dirtyRows,
    showDuplicates,
    duplicateSkus,
    familyRoleFilter,
  ]);

  return (
    <div>
      {/* ── Sticky save banner ───────────────────────────────── */}
      {dirtyCount > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 shadow-sm">
          <span className="flex-1 text-xs font-medium text-amber-800">
            ● {dirtyCount} modification{dirtyCount > 1 ? "s" : ""} non
            sauvegardée{dirtyCount > 1 ? "s" : ""}
            {errorRows.size > 0 && (
              <span className="ml-2 text-red-600">
                · {errorRows.size} erreur{errorRows.size > 1 ? "s" : ""}
              </span>
            )}
          </span>
          <span className="text-[11px] text-amber-600">
            Ctrl/⌘+S pour sauvegarder
          </span>
          <button
            onClick={saveAllDirty}
            disabled={saveAllLoading}
            className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {saveAllLoading ? "Sauvegarde…" : `💾 Sauvegarder (${dirtyCount})`}
          </button>
          <button
            onClick={() => {
              setDirtyRows(new Map());
              setUndoHistory([]);
              setRedoHistory([]);
              fetchProducts();
            }}
            className="text-xs text-amber-700 underline hover:text-amber-900"
          >
            Annuler tout
          </button>
          {saveAllResult && (
            <span
              className={`text-xs font-medium ${saveAllResult.fail > 0 ? "text-red-600" : "text-green-600"}`}
            >
              {saveAllResult.ok} OK
              {saveAllResult.fail > 0
                ? ` · ${saveAllResult.fail} erreur(s)`
                : " ✓"}
            </span>
          )}
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Vue Excel — Catalogue
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {total} produits ·{" "}
            {dirtyCount > 0 ? `${dirtyCount} modifiés` : "aucune modification"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Undo / Redo */}
          <button
            onClick={undo}
            disabled={undoHistory.length === 0}
            title="Annuler (Ctrl+Z)"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30"
          >
            ↩ Annuler{undoHistory.length > 0 ? ` (${undoHistory.length})` : ""}
          </button>
          <button
            onClick={redo}
            disabled={redoHistory.length === 0}
            title="Rétablir (Ctrl+Shift+Z)"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30"
          >
            ↪ Rétablir
          </button>
          <Link
            href="/admin/produits"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            📋 Vue liste
          </Link>
          <button
            onClick={() => exportToCsv(products, dirtyRows, visibleColumns)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ⬇️ Export CSV (vue)
          </button>
          <a
            href="/api/admin/export-products"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ⬇️ Export total
          </a>
        </div>
      </div>

      {/* ── Filtres + vues ───────────────────────────────────── */}
      <div className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-52 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
          >
            <option value="all">Tous statuts</option>
            <option value="publish">Publié</option>
            <option value="draft">Brouillon</option>
            <option value="private">Privé</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
          >
            <option value="">Toutes catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Prix min"
            value={minPriceFilter}
            onChange={(e) => {
              setMinPriceFilter(e.target.value);
              setPage(0);
            }}
            className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            placeholder="Prix max"
            value={maxPriceFilter}
            onChange={(e) => {
              setMaxPriceFilter(e.target.value);
              setPage(0);
            }}
            className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <label className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={missingDescFilter}
              onChange={(e) => {
                setMissingDescFilter(e.target.checked);
                setPage(0);
              }}
              className="accent-[#cc1818]"
            />
            Desc manquante
          </label>
          <select
            value={familyRoleFilter}
            onChange={(e) => {
              setFamilyRoleFilter(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:outline-none"
          >
            <option value="">Tous rôles</option>
            <option value="parent">Mère</option>
            <option value="child">Fille</option>
            <option value="none">Sans rôle</option>
          </select>
          <label
            className={`flex items-center gap-1 rounded border px-2 py-1.5 text-xs cursor-pointer ${showOnlyDirty ? "border-amber-400 bg-amber-50 text-amber-700" : "border-gray-300 bg-white text-gray-600"}`}
          >
            <input
              type="checkbox"
              checked={showOnlyDirty}
              onChange={(e) => setShowOnlyDirty(e.target.checked)}
              className="accent-amber-500"
            />
            {dirtyCount > 0 ? `Modifiés (${dirtyCount})` : "Modifiés seulement"}
          </label>
          <button
            onClick={() => {
              setShowDuplicates((v) => !v);
              setPage(0);
            }}
            className={`rounded border px-2 py-1.5 text-xs font-medium ${showDuplicates ? "border-red-400 bg-red-50 text-red-700" : duplicateCount > 0 ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-300 bg-white text-gray-600"}`}
            title={
              duplicateCount > 0
                ? `${duplicateCount} SKU en doublon détectés`
                : "Aucun doublon SKU sur la page"
            }
          >
            Doublons{duplicateCount > 0 ? ` (${duplicateCount})` : ""}
          </button>
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setCategoryFilter("");
              setMinPriceFilter("");
              setMaxPriceFilter("");
              setMissingDescFilter(false);
              setShowOnlyDirty(false);
              setShowDuplicates(false);
              setFamilyRoleFilter("");
              setPage(0);
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
          >
            Réinitialiser
          </button>
          <span className="self-center text-xs text-gray-500">
            {total} produit{total !== 1 ? "s" : ""}
            {showOnlyDirty && dirtyCount > 0
              ? ` · ${dirtyCount} affiché${dirtyCount > 1 ? "s" : ""}`
              : ""}
          </span>
        </div>

        {/* Active filter chips */}
        {(search ||
          statusFilter !== "all" ||
          categoryFilter ||
          minPriceFilter ||
          maxPriceFilter ||
          missingDescFilter ||
          showOnlyDirty ||
          showDuplicates ||
          familyRoleFilter) && (
          <div className="flex flex-wrap items-center gap-1 border-t border-gray-200 pt-2">
            <span className="text-[11px] font-medium text-gray-500 mr-1">
              Filtres actifs :
            </span>
            {search && (
              <span className="flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] text-indigo-700">
                Recherche: &quot;{search}&quot;
                <button
                  onClick={() => {
                    setSearch("");
                    setPage(0);
                  }}
                  className="ml-0.5 text-indigo-500 hover:text-indigo-700"
                >
                  ×
                </button>
              </span>
            )}
            {statusFilter !== "all" && (
              <span className="flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-700">
                Statut: {statusFilter}
                <button
                  onClick={() => {
                    setStatusFilter("all");
                    setPage(0);
                  }}
                  className="ml-0.5 hover:text-gray-900"
                >
                  ×
                </button>
              </span>
            )}
            {categoryFilter && (
              <span className="flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-700">
                Catégorie:{" "}
                {categories.find((c) => c.id === categoryFilter)?.name ??
                  categoryFilter}
                <button
                  onClick={() => {
                    setCategoryFilter("");
                    setPage(0);
                  }}
                  className="ml-0.5 hover:text-gray-900"
                >
                  ×
                </button>
              </span>
            )}
            {minPriceFilter && (
              <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">
                Prix ≥ {minPriceFilter}€
                <button
                  onClick={() => {
                    setMinPriceFilter("");
                    setPage(0);
                  }}
                  className="ml-0.5 hover:text-blue-900"
                >
                  ×
                </button>
              </span>
            )}
            {maxPriceFilter && (
              <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">
                Prix ≤ {maxPriceFilter}€
                <button
                  onClick={() => {
                    setMaxPriceFilter("");
                    setPage(0);
                  }}
                  className="ml-0.5 hover:text-blue-900"
                >
                  ×
                </button>
              </span>
            )}
            {missingDescFilter && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                Desc manquante
                <button
                  onClick={() => {
                    setMissingDescFilter(false);
                    setPage(0);
                  }}
                  className="ml-0.5 hover:text-amber-900"
                >
                  ×
                </button>
              </span>
            )}
            {familyRoleFilter && (
              <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] text-purple-700">
                Rôle:{" "}
                {familyRoleFilter === "none" ? "sans rôle" : familyRoleFilter}
                <button
                  onClick={() => {
                    setFamilyRoleFilter("");
                    setPage(0);
                  }}
                  className="ml-0.5 hover:text-purple-900"
                >
                  ×
                </button>
              </span>
            )}
            {showDuplicates && (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">
                Doublons SKU ({duplicateCount})
                <button
                  onClick={() => setShowDuplicates(false)}
                  className="ml-0.5 hover:text-red-900"
                >
                  ×
                </button>
              </span>
            )}
            {showOnlyDirty && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                Modifiés ({dirtyCount})
                <button
                  onClick={() => setShowOnlyDirty(false)}
                  className="ml-0.5 hover:text-amber-900"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}

        {/* Colonnes */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-2">
          <span className="text-xs font-medium text-gray-700">Colonnes :</span>
          {(
            [
              ["image", "Image"],
              ["title", "Titre"],
              ["sku", "SKU"],
              ["family", "Famille"],
              ["price", "Prix"],
              ["stock", "Stock/Fiscalité"],
              ["supplier", "Fournisseur"],
              ["status", "Statut"],
              ["seo", "SEO"],
              ["actions", "Actions"],
            ] as Array<[ColumnKey, string]>
          ).map(([key, label]) => (
            <label
              key={key}
              className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600"
            >
              <input
                type="checkbox"
                checked={visibleColumns.has(key)}
                onChange={() => toggleColumn(key)}
                className="accent-[#cc1818]"
              />
              {label}
            </label>
          ))}
        </div>

        {/* Vues V2 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-2">
          <span className="text-xs font-medium text-gray-700">Vues :</span>
          <input
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveCurrentView();
            }}
            placeholder="Nom de vue…"
            className="w-36 rounded border border-gray-300 px-2 py-1 text-xs"
          />
          <button
            onClick={saveCurrentView}
            disabled={!viewName.trim()}
            className="rounded bg-[#cc1818] px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            Sauver vue
          </button>
          {savedViews.map((view) => (
            <div
              key={view.id}
              className={`group inline-flex items-center gap-0.5 rounded-full border px-2 py-1 text-xs ${
                activeViewId === view.id
                  ? "border-[#cc1818] bg-red-50 text-[#cc1818]"
                  : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {editingViewId === view.id ? (
                <input
                  autoFocus
                  value={editingViewName}
                  onChange={(e) => setEditingViewName(e.target.value)}
                  onBlur={() => commitRenameView(view.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRenameView(view.id);
                    if (e.key === "Escape") setEditingViewId(null);
                  }}
                  className="w-24 rounded border border-gray-300 px-1 py-0 text-xs focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => applySavedView(view)}
                  className="hover:text-[#cc1818] max-w-[120px] truncate"
                >
                  {activeViewId === view.id && (
                    <span className="mr-0.5">●</span>
                  )}
                  {view.name}
                </button>
              )}
              <button
                onClick={() => startRenameView(view)}
                title="Renommer"
                className="hidden group-hover:inline text-gray-400 hover:text-blue-600 px-0.5"
              >
                ✎
              </button>
              <button
                onClick={() => duplicateView(view)}
                title="Dupliquer"
                className="hidden group-hover:inline text-gray-400 hover:text-green-600 px-0.5"
              >
                ⧉
              </button>
              <button
                onClick={() => deleteSavedView(view.id)}
                title="Supprimer"
                className="text-gray-400 hover:text-red-600 px-0.5"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Barre actions groupées ────────────────────────────── */}
      {selected.size > 0 && (
        <div className="mb-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          {/* Row 1: Status/prix + selection */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-blue-800">
              {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
            </span>
            <button
              onClick={toggleAll}
              className="text-xs text-blue-600 underline"
            >
              {selected.size === displayedProducts.length
                ? "Désélectionner tout"
                : "Tout sélectionner (page)"}
            </button>
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
            >
              <option value="">Actions statut/prix ▼</option>
              <option value="publish">Publier</option>
              <option value="draft">Mettre en brouillon</option>
              <option value="price_discount">Remise % →</option>
              <option value="price_increase">Hausse % →</option>
              <option value="change_category">Changer catégorie →</option>
            </select>
            {(bulkAction === "price_discount" ||
              bulkAction === "price_increase") && (
              <input
                type="number"
                min={1}
                max={100}
                placeholder="%"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                className="w-16 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
              />
            )}
            {bulkAction === "change_category" && (
              <select
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
              >
                <option value="">Choisir…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {bulkAction && (
              <button
                onClick={handleBulkAction}
                disabled={bulkLoading || !bulkAction}
                className="rounded bg-[#cc1818] px-3 py-1 text-xs font-semibold text-white hover:bg-[#aa1414] transition-colors disabled:opacity-50"
              >
                {bulkLoading ? "…" : "Appliquer (serveur)"}
              </button>
            )}
          </div>

          {/* Row 2: Modifier champ */}
          <div className="flex flex-wrap items-center gap-2 border-t border-blue-200 pt-2">
            <span className="text-xs font-medium text-blue-700">
              Modifier champ :
            </span>
            <select
              value={bulkField}
              onChange={(e) => {
                setBulkField(e.target.value);
                setBulkFieldValue("");
              }}
              className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
            >
              <option value="">Choisir un champ…</option>
              {BULK_FIELD_OPTIONS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            {bulkField &&
              (() => {
                const fieldDef = BULK_FIELD_OPTIONS.find(
                  (f) => f.id === bulkField,
                );
                if (!fieldDef) return null;
                if (fieldDef.type === "select") {
                  return (
                    <select
                      value={bulkFieldValue}
                      onChange={(e) => setBulkFieldValue(e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
                    >
                      <option value="">Valeur…</option>
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  );
                }
                return (
                  <input
                    type={fieldDef.type}
                    value={bulkFieldValue}
                    onChange={(e) => setBulkFieldValue(e.target.value)}
                    placeholder={`Valeur pour ${fieldDef.label}…`}
                    className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none w-48"
                  />
                );
              })()}
            {bulkField && (
              <button
                onClick={handleBulkFieldSet}
                disabled={bulkFieldLoading || !bulkFieldValue}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {bulkFieldApplied > 0
                  ? `✓ ${bulkFieldApplied} modifié(s)`
                  : "Appliquer (local)"}
              </button>
            )}
          </div>

          {/* Row 3: Remplir vers le bas / Vider */}
          <div className="flex flex-wrap items-center gap-2 border-t border-blue-200 pt-2">
            <span className="text-xs font-medium text-blue-700">
              Remplissage rapide :
            </span>
            <select
              value={fillField}
              onChange={(e) => setFillField(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
            >
              <option value="regular_price">Prix HT</option>
              <option value="sale_price">Prix promo</option>
              <option value="status">Statut</option>
              <option value="stock_quantity">Stock qty</option>
              <option value="stock_status">Stock status</option>
              <option value="supplier_ref">Supplier ref</option>
              <option value="supplier_price">Supplier price</option>
              <option value="parent_sku">parent_sku</option>
              <option value="family_role">family_role</option>
              <option value="short_description">Desc. courte</option>
              <option value="seo_title">SEO title</option>
              <option value="seo_description">SEO description</option>
            </select>
            <button
              onClick={fillDown}
              disabled={selected.size < 2}
              title="Copie la valeur du 1er produit sélectionné vers tous les suivants"
              className="rounded bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
            >
              {fillResult > 0 ? `✓ ${fillResult}` : "⬇ Remplir vers le bas"}
            </button>
            <button
              onClick={clearField}
              title="Vider ce champ pour tous les produits sélectionnés"
              className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              ✕ Vider le champ
            </button>
          </div>

          {/* Row 4: Formules */}
          <div className="flex flex-wrap items-center gap-2 border-t border-blue-200 pt-2">
            <span className="text-xs font-medium text-blue-700">Formule :</span>
            <select
              value={formulaField}
              onChange={(e) => setFormulaField(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
            >
              <option value="regular_price">Prix HT</option>
              <option value="sale_price">Prix promo</option>
              <option value="stock_quantity">Stock qty</option>
              <option value="stock_status">Stock status</option>
              <option value="supplier_ref">Supplier ref</option>
              <option value="parent_sku">parent_sku</option>
              <option value="family_role">family_role</option>
              <option value="short_description">Desc. courte</option>
              <option value="seo_title">SEO title</option>
              <option value="seo_description">SEO description</option>
            </select>
            <select
              value={formulaOp}
              onChange={(e) => setFormulaOp(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
            >
              <option value="set">Remplacer</option>
              <option value="prepend">Préfixer</option>
              <option value="append">Suffixer</option>
              <option value="replace">Rechercher/Remplacer</option>
              <option value="trim">Supprimer espaces (trim)</option>
              {[
                "regular_price",
                "sale_price",
                "stock_quantity",
                "supplier_price",
              ].includes(formulaField) && (
                <>
                  <option value="increase_pct">+ %</option>
                  <option value="decrease_pct">- %</option>
                  <option value="increase_abs">+ montant</option>
                  <option value="decrease_abs">- montant</option>
                </>
              )}
            </select>
            {formulaOp === "replace" ? (
              <>
                <input
                  value={formulaTextFrom}
                  onChange={(e) => setFormulaTextFrom(e.target.value)}
                  placeholder="Chercher"
                  className="w-32 rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <input
                  value={formulaTextTo}
                  onChange={(e) => setFormulaTextTo(e.target.value)}
                  placeholder="Remplacer par"
                  className="w-32 rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </>
            ) : formulaOp !== "trim" ? (
              <input
                value={formulaValue}
                onChange={(e) => setFormulaValue(e.target.value)}
                placeholder="Valeur"
                className="w-36 rounded border border-gray-300 px-2 py-1 text-xs"
              />
            ) : null}
            <button
              onClick={applyFormula}
              className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              {formulaApplied > 0 ? `✓ ${formulaApplied}` : "Appliquer formule"}
            </button>
          </div>

          {/* Row 5: Paste Matrix */}
          <div className="flex flex-wrap items-center gap-2 border-t border-blue-200 pt-2">
            <span className="text-xs font-medium text-blue-700">
              Collage Excel :
            </span>
            <button
              onClick={() => {
                setPasteMode(!pasteMode);
                setPastePreview(null);
              }}
              className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${pasteMode ? "bg-gray-700 text-white" : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"}`}
            >
              {pasteMode ? "✕ Fermer" : "📋 Mode collage"}
            </button>
            {pasteMode && (
              <span className="text-xs text-blue-600">
                Coller des données tabulées depuis Excel ou Sheets — les lignes
                seront mappées sur les produits sélectionnés.
              </span>
            )}
          </div>

          {pasteMode && (
            <div className="border-t border-blue-200 pt-2 space-y-2">
              {/* Column mapping hint */}
              <div className="rounded bg-blue-100 px-3 py-2 text-xs text-blue-800">
                <strong>Mappage colonnes :</strong>{" "}
                {PASTE_COLUMN_MAP.filter((c) => {
                  if (c.field === "name") return visibleColumns.has("title");
                  if (c.field === "sku") return visibleColumns.has("sku");
                  if (c.field === "regular_price")
                    return visibleColumns.has("price");
                  if (c.field === "status") return visibleColumns.has("status");
                  return false;
                })
                  .map((c, i) => `Col ${i + 1} → ${c.label}`)
                  .join(" · ")}
                <span className="ml-2 text-blue-600">
                  ({selected.size} ligne{selected.size > 1 ? "s" : ""} attendue
                  {selected.size > 1 ? "s" : ""})
                </span>
              </div>
              <textarea
                ref={pasteTaRef}
                onPaste={handlePaste}
                placeholder={`Collez vos données Excel ici (Ctrl+V / ⌘+V)\n${selected.size} ligne(s) sélectionnée(s)`}
                rows={4}
                className="w-full rounded border border-dashed border-blue-400 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {pastePreview && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-blue-800">
                    Aperçu : {pastePreview.recognized} ligne
                    {pastePreview.recognized > 1 ? "s" : ""} reconnue
                    {pastePreview.recognized > 1 ? "s" : ""} ·{" "}
                    {pastePreview.applied} cellule
                    {pastePreview.applied > 1 ? "s" : ""} valide
                    {pastePreview.applied > 1 ? "s" : ""} ·{" "}
                    {pastePreview.ignored > 0 && (
                      <span className="text-amber-700">
                        {pastePreview.ignored} ignorée
                        {pastePreview.ignored > 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                  <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Produit</th>
                          <th className="px-2 py-1.5 text-left">Changements</th>
                          <th className="px-2 py-1.5 text-left text-amber-600">
                            Ignorés
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {pastePreview.rows.map((row) => (
                          <tr key={row.product.id}>
                            <td className="px-2 py-1 font-medium text-gray-700 max-w-[150px] truncate">
                              {row.product.title || row.product.name}
                            </td>
                            <td className="px-2 py-1 text-green-700">
                              {Object.entries(row.changes).map(([f, v]) => (
                                <span key={f} className="mr-2">
                                  {f}={String(v)}
                                </span>
                              ))}
                              {Object.keys(row.changes).length === 0 && (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-amber-600">
                              {Object.entries(row.ignored).map(
                                ([f, reason]) => (
                                  <span key={f} className="mr-2" title={reason}>
                                    {f} ⚠
                                  </span>
                                ),
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={applyPastePreview}
                      disabled={pastePreview.applied === 0}
                      className="rounded bg-[#cc1818] px-3 py-1 text-xs font-semibold text-white hover:bg-[#aa1414] disabled:opacity-50"
                    >
                      ✓ Appliquer {pastePreview.applied} cellule
                      {pastePreview.applied > 1 ? "s" : ""} (local)
                    </button>
                    <button
                      onClick={() => setPastePreview(null)}
                      className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tableau ──────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={
                    selected.size === displayedProducts.length &&
                    displayedProducts.length > 0
                  }
                  onChange={toggleAll}
                  className="accent-[#cc1818]"
                />
              </th>
              {visibleColumns.has("image") && (
                <th className="w-12 px-3 py-3">Image</th>
              )}
              {visibleColumns.has("title") && (
                <th className="px-3 py-3 text-left">Titre</th>
              )}
              {visibleColumns.has("sku") && (
                <th className="w-28 px-3 py-3 text-left">SKU</th>
              )}
              {visibleColumns.has("family") && (
                <th className="w-56 px-3 py-3 text-left">Famille / Type</th>
              )}
              {visibleColumns.has("price") && (
                <th className="w-28 px-3 py-3 text-right">Prix HT</th>
              )}
              {visibleColumns.has("stock") && (
                <th className="w-48 px-3 py-3 text-left">Stock / Fiscalité</th>
              )}
              {visibleColumns.has("supplier") && (
                <th className="w-44 px-3 py-3 text-left">Fournisseur</th>
              )}
              {visibleColumns.has("status") && (
                <th className="w-24 px-3 py-3 text-left">Statut</th>
              )}
              {visibleColumns.has("seo") && (
                <th className="w-24 px-3 py-3 text-center">SEO</th>
              )}
              {visibleColumns.has("actions") && (
                <th className="w-28 px-3 py-3 text-center">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td
                  colSpan={visibleColumnCount}
                  className="py-12 text-center text-gray-400"
                >
                  Chargement…
                </td>
              </tr>
            ) : displayedProducts.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnCount}
                  className="py-12 text-center text-gray-400"
                >
                  {showOnlyDirty
                    ? "Aucune modification locale en attente"
                    : "Aucun produit"}
                </td>
              </tr>
            ) : (
              displayedProducts.map((p) => {
                const rowDirty = dirtyRows.has(p.id);
                const dirty = dirtyRows.get(p.id) ?? {};
                const hasError = errorRows.has(p.id);
                const title = p.name || p.title || "";
                const handle = p.handle || p.slug || "";
                const variantsOpen = expandedVariantRows.has(p.id);
                const variantRows = variantsByProduct.get(p.id) ?? [];
                const variantLoading = variantsLoadingByProduct.has(p.id);
                const variantError = variantErrors.get(p.id) ?? null;
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={`hover:bg-gray-50 transition-colors ${selected.has(p.id) ? "bg-blue-50" : ""} ${rowDirty ? "border-l-2 border-amber-400" : ""} ${hasError ? "border-l-2 border-red-500 bg-red-50" : ""} ${p.sku && duplicateSkus.has(p.sku) ? "ring-1 ring-inset ring-orange-300 bg-orange-50/30" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="accent-[#cc1818]"
                        />
                      </td>
                      {visibleColumns.has("image") && (
                        <td className="px-3 py-2">
                          <div className="h-10 w-10 overflow-hidden rounded border border-gray-100 bg-gray-50">
                            {p.featured_image_url ? (
                              <Image
                                src={p.featured_image_url}
                                alt={title}
                                width={40}
                                height={40}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <div className="h-full w-full bg-gray-100" />
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.has("title") && (
                        <td className="max-w-xs px-3 py-2">
                          <EditableCell
                            value={title}
                            dirty={"name" in dirty || "title" in dirty}
                            error={hasError}
                            onSave={(v) => patchProduct(p.id, "name", v)}
                          />
                        </td>
                      )}
                      {visibleColumns.has("sku") && (
                        <td className="px-3 py-2">
                          <EditableCell
                            value={p.sku ?? ""}
                            dirty={"sku" in dirty}
                            error={hasError}
                            onSave={(v) => patchProduct(p.id, "sku", v)}
                          />
                        </td>
                      )}
                      {visibleColumns.has("family") && (
                        <td className="px-3 py-2 align-top">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                                {p.type || "—"}
                              </span>
                              <EditableCell
                                value={p.family_role ?? "standalone"}
                                dirty={"family_role" in dirty}
                                error={hasError}
                                onSave={(v) =>
                                  patchProduct(p.id, "family_role", v)
                                }
                              />
                            </div>
                            <EditableCell
                              value={p.parent_sku ?? ""}
                              dirty={"parent_sku" in dirty}
                              error={hasError}
                              onSave={(v) =>
                                patchProduct(p.id, "parent_sku", v)
                              }
                            />
                            <div className="text-[10px] text-gray-500">
                              {p.variant_count ?? 0} var. ·{" "}
                              {p.family_name
                                ? `${p.family_name} (${p.family_children_count ?? 0})`
                                : "sans famille DB"}
                            </div>
                            {(p.variant_count ?? 0) > 0 && (
                              <Link
                                href={`/admin/produits/${p.id}`}
                                className="inline-flex text-[10px] text-blue-600 hover:underline"
                              >
                                Ouvrir variantes
                              </Link>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.has("price") && (
                        <td className="px-3 py-2 text-right">
                          <div className="space-y-1">
                            <EditableCell
                              value={p.regular_price ?? ""}
                              type="number"
                              dirty={"regular_price" in dirty}
                              error={hasError}
                              onSave={(v) =>
                                patchProduct(
                                  p.id,
                                  "regular_price",
                                  v === "" ? null : parseFloat(v),
                                )
                              }
                            />
                            <EditableCell
                              value={p.sale_price ?? ""}
                              type="number"
                              dirty={"sale_price" in dirty}
                              error={hasError}
                              onSave={(v) =>
                                patchProduct(
                                  p.id,
                                  "sale_price",
                                  v === "" ? null : parseFloat(v),
                                )
                              }
                            />
                          </div>
                        </td>
                      )}
                      {visibleColumns.has("stock") && (
                        <td className="px-3 py-2">
                          <div className="space-y-1">
                            <EditableCell
                              value={p.stock_quantity ?? ""}
                              type="number"
                              dirty={"stock_quantity" in dirty}
                              error={hasError}
                              onSave={(v) =>
                                patchProduct(
                                  p.id,
                                  "stock_quantity",
                                  v === "" ? null : parseInt(v, 10),
                                )
                              }
                            />
                            <EditableCell
                              value={p.stock_status ?? "instock"}
                              dirty={"stock_status" in dirty}
                              error={hasError}
                              onSave={(v) =>
                                patchProduct(p.id, "stock_status", v)
                              }
                            />
                            <div className="grid grid-cols-2 gap-1">
                              <EditableCell
                                value={p.tax_status ?? ""}
                                dirty={"tax_status" in dirty}
                                error={hasError}
                                onSave={(v) =>
                                  patchProduct(p.id, "tax_status", v)
                                }
                              />
                              <EditableCell
                                value={p.tax_class ?? ""}
                                dirty={"tax_class" in dirty}
                                error={hasError}
                                onSave={(v) =>
                                  patchProduct(p.id, "tax_class", v)
                                }
                              />
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleColumns.has("supplier") && (
                        <td className="px-3 py-2">
                          <div className="space-y-1">
                            <EditableCell
                              value={p.supplier_ref ?? ""}
                              dirty={"supplier_ref" in dirty}
                              error={hasError}
                              onSave={(v) =>
                                patchProduct(p.id, "supplier_ref", v)
                              }
                            />
                            <EditableCell
                              value={p.supplier_code ?? ""}
                              dirty={"supplier_code" in dirty}
                              error={hasError}
                              onSave={(v) =>
                                patchProduct(p.id, "supplier_code", v)
                              }
                            />
                            <EditableCell
                              value={p.supplier_price ?? ""}
                              type="number"
                              dirty={"supplier_price" in dirty}
                              error={hasError}
                              onSave={(v) =>
                                patchProduct(
                                  p.id,
                                  "supplier_price",
                                  v === "" ? null : parseFloat(v),
                                )
                              }
                            />
                          </div>
                        </td>
                      )}
                      {visibleColumns.has("status") && (
                        <td className="px-3 py-2">
                          <SelectCell
                            value={p.status}
                            options={STATUS_OPTIONS}
                            dirty={"status" in dirty}
                            onSave={(v) => patchProduct(p.id, "status", v)}
                          />
                        </td>
                      )}
                      {visibleColumns.has("seo") && (
                        <td className="px-3 py-2 text-center">
                          <SeoVoyant score={seoScore(p)} />
                        </td>
                      )}
                      {visibleColumns.has("actions") && (
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1.5">
                            <Link
                              href={`/product/${handle}`}
                              target="_blank"
                              className="text-gray-400 hover:text-[#cc1818] transition-colors"
                              title="Voir"
                            >
                              👁️
                            </Link>
                            <Link
                              href={`/admin/produits/${p.id}`}
                              className="text-gray-400 hover:text-[#cc1818] transition-colors"
                              title="Éditer"
                            >
                              ✏️
                            </Link>
                            {(p.variant_count ?? 0) > 0 && (
                              <button
                                onClick={() => toggleVariantsRow(p.id)}
                                className={`transition-colors ${variantsOpen ? "text-indigo-600" : "text-gray-400 hover:text-[#cc1818]"}`}
                                title={
                                  variantsOpen
                                    ? "Masquer variantes"
                                    : "Afficher variantes inline"
                                }
                              >
                                🧬
                              </button>
                            )}
                            <a
                              href={`/api/product-pdf/${handle}`}
                              target="_blank"
                              className="text-gray-400 hover:text-[#cc1818] transition-colors"
                              title="PDF"
                            >
                              📄
                            </a>
                          </div>
                        </td>
                      )}
                    </tr>
                    {variantsOpen && (
                      <tr key={`${p.id}-variants`}>
                        <td
                          colSpan={visibleColumnCount}
                          className="bg-indigo-50/40 px-3 py-3"
                        >
                          <div className="rounded-lg border border-indigo-100 bg-white p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-xs font-semibold text-indigo-700">
                                Variantes de {title} ({p.variant_count ?? 0})
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => void loadVariants(p.id)}
                                  className="rounded border border-indigo-200 px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-50"
                                >
                                  Rafraîchir
                                </button>
                                <Link
                                  href={`/admin/produits/${p.id}`}
                                  className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                                >
                                  Ouvrir fiche complète
                                </Link>
                              </div>
                            </div>

                            {variantLoading ? (
                              <p className="text-xs text-gray-500">
                                Chargement variantes...
                              </p>
                            ) : variantError ? (
                              <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                                {variantError}
                              </p>
                            ) : variantRows.length === 0 ? (
                              <p className="text-xs text-gray-500">
                                Aucune variante trouvée.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded border border-gray-200">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50 text-left text-[11px] text-gray-500">
                                    <tr>
                                      <th className="px-2 py-1.5">
                                        SKU variante
                                      </th>
                                      <th className="px-2 py-1.5">Attributs</th>
                                      <th className="px-2 py-1.5 text-right">
                                        Prix HT
                                      </th>
                                      <th className="px-2 py-1.5">Stock</th>
                                      <th className="px-2 py-1.5">Statut</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {variantRows.map((variant) => (
                                      <tr key={variant.id}>
                                        <td className="px-2 py-1.5 font-mono text-gray-700">
                                          <EditableCell
                                            value={variant.sku ?? ""}
                                            onSave={(v) =>
                                              patchVariant(
                                                p.id,
                                                variant.id,
                                                "sku",
                                                v,
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-2 py-1.5 text-gray-600">
                                          {(variant.variant_attributes ?? [])
                                            .length > 0
                                            ? (variant.variant_attributes ?? [])
                                                .map(
                                                  (attr) =>
                                                    `${attr.attribute_name}: ${attr.attribute_value}`,
                                                )
                                                .join(" · ")
                                            : "—"}
                                        </td>
                                        <td className="px-2 py-1.5 text-right">
                                          <EditableCell
                                            value={variant.regular_price ?? ""}
                                            type="number"
                                            onSave={(v) =>
                                              patchVariant(
                                                p.id,
                                                variant.id,
                                                "regular_price",
                                                v === "" ? null : parseFloat(v),
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <SelectCell
                                            value={
                                              variant.stock_status || "instock"
                                            }
                                            options={[
                                              {
                                                id: "instock",
                                                label: "En stock",
                                              },
                                              {
                                                id: "outofstock",
                                                label: "Rupture",
                                              },
                                              {
                                                id: "onbackorder",
                                                label: "Sur commande",
                                              },
                                            ]}
                                            onSave={(v) =>
                                              patchVariant(
                                                p.id,
                                                variant.id,
                                                "stock_status",
                                                v,
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <SelectCell
                                            value={variant.status || "publish"}
                                            options={STATUS_OPTIONS}
                                            onSave={(v) =>
                                              patchVariant(
                                                p.id,
                                                variant.id,
                                                "status",
                                                v,
                                              )
                                            }
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ───────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page + 1} sur {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              ← Précédent
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Suivant →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
