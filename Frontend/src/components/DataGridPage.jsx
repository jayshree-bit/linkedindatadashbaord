import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import DataGrid, { textEditor, SelectColumn } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchRows,
  addRow,
  updateRow,
  deleteRow,
  patchLocal,
} from "../features/dataSlice";
import { can } from "../features/authSlice";
import {
  getDistinctApi,
  exportRowsApi,
  exportStartApi,
  exportStatusApi,
  exportFileApi,
  uploadCompanyListApi,
  updateLinkedinProfilesApi,
  getLinkedinUpdateStatusApi,
  exportLinkedinLogsApi,
} from "../services/dataService";
import "./DataGridPage.css";
import ImportExcelModal from "./ImportExcelModal";
import CompanyImportModal from "./CompanyImportModal";
import CompanyListModal from "./CompanyListModal";
import { saveBlob } from "./LinkedinLogPanel";
/* ---------- Filter model helpers ---------- */

const OPERATORS = [
  { id: "contains", label: "Contains", text: true },
  { id: "notContains", label: "Does not contain", text: true },
  { id: "equals", label: "Equals", text: true },
  { id: "notEqual", label: "Does not equal", text: true },
  { id: "startsWith", label: "Begins with", text: true },
  { id: "endsWith", label: "Ends with", text: true },
  { id: "blank", label: "Blank", text: false },
  { id: "notBlank", label: "Not blank", text: false },
];

const needsText = (op) => OPERATORS.find((o) => o.id === op)?.text ?? true;
const isBlankValue = (v) => v === null || v === undefined || v === "";
const sameValue = (a, b) => (isBlankValue(a) && isBlankValue(b)) || a === b;
const labelOf = (v) => (isBlankValue(v) ? "(Blanks)" : String(v));
const isAdvanced = (m) =>
  Boolean(m) && (m.values != null || (m.op && m.op !== "contains"));
const MAX_SELECT = 1000;

// Columns that stay pinned on the left for the prospect grid.
// Compared after lowercasing and removing spaces/symbols.
const STICKY_NAME_KEYS = new Set(["employeename", "name"]);
const normKey = (k) =>
  String(k)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/* ---------- Toaster (no extra package needed) ---------- */

const TOAST_COLORS = {
  success: "#16a34a",
  error: "#dc2626",
  warning: "#d97706",
  info: "#2563eb",
};
const pageList = (page, total) => {
  const nums = new Set([1, total, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => nums.add(n));
  if (page >= total - 2)
    [total - 1, total - 2, total - 3].forEach((n) => nums.add(n));
  const sorted = [...nums]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
};

const readDark = () => {
  const els = [document.documentElement, document.body];
  return els.some(
    (el) =>
      el.classList.contains("dark") ||
      el.getAttribute("data-theme") === "dark" ||
      el.getAttribute("data-bs-theme") === "dark",
  );
};

function useIsDark() {
  const [dark, setDark] = useState(readDark);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(readDark()));
    const opts = {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-bs-theme"],
    };
    obs.observe(document.documentElement, opts);
    obs.observe(document.body, opts);
    return () => obs.disconnect();
  }, []);
  return dark;
}
function Toaster({ toasts, onClose }) {
  if (!toasts.length) return null;
  return createPortal(
    <div
      role="region"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 380,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 12px",
            background: "#ffffff",
            color: "#111827",
            fontSize: 14,
            lineHeight: 1.4,
            borderRadius: 6,
            borderLeft: `4px solid ${TOAST_COLORS[t.type] ?? TOAST_COLORS.info}`,
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.18)",
          }}
        >
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onClose(t.id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              color: "#6b7280",
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
const LINKEDIN_JOB_KEY = "linkedinUpdateJob";

const saveJobMeta = (meta) => {
  try {
    localStorage.setItem(LINKEDIN_JOB_KEY, JSON.stringify(meta));
  } catch {}
};
const loadJobMeta = () => {
  try {
    return JSON.parse(localStorage.getItem(LINKEDIN_JOB_KEY) || "null");
  } catch {
    return null;
  }
};
const clearJobMeta = () => {
  try {
    localStorage.removeItem(LINKEDIN_JOB_KEY);
  } catch {}
};
const nameOfRecord = (r) =>
  [r.firstName, r.lastName].filter(Boolean).join(" ") || r.employeeName || "—";
/* ---------- Header (AG Grid style: title + sort icon + menu, then filter box) ---------- */

const HeaderCtx = createContext(null);
const COLUMN_DRAG_TYPE = "text/x-dgp-column";

const stopKeys = (e) => {
  if (e.key !== "Tab") e.stopPropagation();
};

function SortIcon({ direction }) {
  return (
    <span className="agh-sort" aria-hidden="true">
      <span className={`agh-up ${direction === "ASC" ? "on" : ""}`} />
      <span className={`agh-down ${direction === "DESC" ? "on" : ""}`} />
    </span>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M1 3h12M3 7h8M5 11h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/* Popup: operator list + searchable checklist of the column's values (server-backed) */
function FilterPopup({ columnKey, anchor, onClose }) {
  const { filterModels, setFilterModel, fetchDistinct } = useContext(HeaderCtx);
  const model = filterModels[columnKey] ?? {};
  const op = model.op ?? "contains";
  const values = model.values ?? null;

  const [opOpen, setOpOpen] = useState(false);
  const [q, setQ] = useState("");
  const [list, setList] = useState({
    items: [],
    hasMore: false,
    loading: true,
    error: "",
  });

  useEffect(() => {
    let cancelled = false;
    setList((current) => ({ ...current, loading: true, error: "" }));

    const timer = setTimeout(
      async () => {
        try {
          const res = await fetchDistinct(columnKey, q);
          if (!cancelled) {
            setList({
              items: res?.values ?? [],
              hasMore: Boolean(res?.hasMore),
              loading: false,
              error: "",
            });
          }
        } catch {
          if (!cancelled) {
            setList({
              items: [],
              hasMore: false,
              loading: false,
              error: "Could not load values.",
            });
          }
        }
      },
      q ? 300 : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [columnKey, q, fetchDistinct]);

  const { items, hasMore } = list;
  const complete = !hasMore && !q; // the list is every value in the column

  // No values filter + complete list = everything is ticked.
  const isChecked = (v) =>
    values ? values.some((x) => sameValue(x, v)) : !hasMore;
  const allChecked = items.length > 0 && items.every(isChecked);

  const commit = (next) => {
    const normalized =
      complete && next && next.length === items.length ? null : next;
    setFilterModel(columnKey, { values: normalized });
  };

  const baseValues = () => values ?? (hasMore ? [] : items);

  const toggle = (v) => {
    const base = baseValues();
    const exists = base.some((x) => sameValue(x, v));
    commit(exists ? base.filter((x) => !sameValue(x, v)) : [...base, v]);
  };

  const toggleAll = () => {
    const base = baseValues();
    if (allChecked) {
      commit(base.filter((x) => !items.some((i) => sameValue(i, x))));
    } else {
      const extra = items.filter((i) => !base.some((x) => sameValue(x, i)));
      commit([...base, ...extra]);
    }
  };

  const opLabel = OPERATORS.find((o) => o.id === op)?.label ?? "Contains";

  return createPortal(
    <>
      <div className="agm-backdrop" onClick={onClose} />
      <div
        className="agf"
        style={{ top: anchor.top, left: anchor.left }}
        onKeyDown={stopKeys}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="agf-op"
          onClick={() => setOpOpen((o) => !o)}
        >
          <span>
            Text Filter <em>{opLabel}</em>
          </span>
          <span>{opOpen ? "⌄" : "›"}</span>
        </button>

        {opOpen && (
          <div className="agf-ops">
            {OPERATORS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`agf-opt ${op === o.id ? "on" : ""}`}
                onClick={() => {
                  setFilterModel(columnKey, { op: o.id });
                  setOpOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <div className="agf-search">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search values..."
            aria-label="Search values"
            autoFocus
          />
        </div>

        <div className="agf-list">
          {list.loading && <div className="agf-note">Loading...</div>}
          {list.error && <div className="agf-note agf-error">{list.error}</div>}
          {!list.loading && !list.error && items.length === 0 && (
            <div className="agf-note">No values found.</div>
          )}

          {items.length > 0 && (
            <label className="agf-item">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
              />
              <span>{q ? "(Select all results)" : "(Select all)"}</span>
            </label>
          )}

          {items.map((v) => (
            <label
              key={isBlankValue(v) ? "__blank" : `${typeof v}:${v}`}
              className="agf-item"
            >
              <input
                type="checkbox"
                checked={isChecked(v)}
                onChange={() => toggle(v)}
              />
              <span>{labelOf(v)}</span>
            </label>
          ))}

          {hasMore && (
            <div className="agf-note">
              Showing the first {items.length} values. Search to narrow the
              list.
            </div>
          )}
        </div>

        <div className="agf-foot">
          <button
            type="button"
            className="agf-clear"
            onClick={() => {
              setFilterModel(columnKey, null);
              setQ("");
            }}
          >
            Clear filter
          </button>
          <button type="button" className="agf-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function HeaderCell({ column }) {
  const {
    sortColumns,
    setSort,
    filterModels,
    setFilterModel,
    hideColumn,
    moveColumn,
  } = useContext(HeaderCtx);
  const key = column.key;
  const model = filterModels[key] ?? {};
  const op = model.op ?? "contains";
  const direction =
    sortColumns[0]?.columnKey === key ? sortColumns[0].direction : null;

  const [menu, setMenu] = useState(null);
  const [popup, setPopup] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const btnRef = useRef(null);
  const filterBtnRef = useRef(null);

  const cycleSort = () =>
    setSort(
      key,
      direction === null ? "ASC" : direction === "ASC" ? "DESC" : null,
    );

  const openMenu = (e) => {
    e.stopPropagation();
    const rect = btnRef.current.getBoundingClientRect();
    setMenu({ top: rect.bottom + 4, left: Math.max(8, rect.right - 190) });
  };

  const openPopup = (e) => {
    e.stopPropagation();
    const rect = filterBtnRef.current.getBoundingClientRect();
    setPopup({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - 272, window.innerWidth - 288)),
    });
  };

  const close = () => setMenu(null);
  const pick = (fn) => () => {
    fn();
    close();
  };

  const textEnabled = needsText(op);

  /* Column reordering (HTML5 drag & drop): drag the grip, drop on another header */
  const onGripDragStart = (e) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(COLUMN_DRAG_TYPE, key);
    const cell = e.currentTarget.closest(".rdg-cell");
    if (cell) e.dataTransfer.setDragImage(cell, 24, 20);
  };
  const isColumnDrag = (e) =>
    Array.from(e.dataTransfer.types).includes(COLUMN_DRAG_TYPE);
  const onDragOver = (e) => {
    if (!isColumnDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  };
  const onDrop = (e) => {
    if (!isColumnDrag(e)) return;
    e.preventDefault();
    setDragOver(false);
    const sourceKey = e.dataTransfer.getData(COLUMN_DRAG_TYPE);
    if (sourceKey && sourceKey !== key) moveColumn(sourceKey, key);
  };

  return (
    <div
      className={`agh ${dragOver ? "agh-drop" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="agh-top">
        <span
          className="agh-grip"
          draggable
          onDragStart={onGripDragStart}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder column"
          aria-label={`Reorder ${column.name}`}
        >
          ⠿
        </span>
        <button
          type="button"
          className="agh-title"
          onClick={cycleSort}
          title={column.name}
        >
          <span className="agh-name">{column.name}</span>
          <SortIcon direction={direction} />
        </button>
        <button
          type="button"
          ref={btnRef}
          className="agh-menu-btn"
          aria-label={`${column.name} menu`}
          onClick={openMenu}
        >
          ⋮
        </button>
      </div>

      <div className="agh-filter">
        <input
          type="text"
          value={textEnabled ? (model.text ?? "") : ""}
          disabled={!textEnabled}
          onChange={(e) => setFilterModel(key, { text: e.target.value })}
          onKeyDown={stopKeys}
          onClick={(e) => e.stopPropagation()}
          placeholder={
            textEnabled
              ? "Filter..."
              : OPERATORS.find((o) => o.id === op)?.label
          }
          aria-label={`Filter ${column.name}`}
        />
        <button
          type="button"
          ref={filterBtnRef}
          className={`agh-filter-btn ${isAdvanced(model) ? "on" : ""}`}
          aria-label={`${column.name} filter options`}
          onClick={openPopup}
        >
          <FilterIcon />
        </button>
      </div>

      {popup && (
        <FilterPopup
          columnKey={key}
          anchor={popup}
          onClose={() => setPopup(null)}
        />
      )}

      {menu &&
        createPortal(
          <>
            <div className="agm-backdrop" onClick={close} />
            <div
              className="agm-menu"
              style={{ top: menu.top, left: menu.left }}
            >
              <button
                type="button"
                className="agm-item"
                onClick={pick(() => setSort(key, "ASC"))}
              >
                Sort ascending
              </button>
              <button
                type="button"
                className="agm-item"
                onClick={pick(() => setSort(key, "DESC"))}
              >
                Sort descending
              </button>
              <button
                type="button"
                className="agm-item"
                disabled={!direction}
                onClick={pick(() => setSort(key, null))}
              >
                Clear sort
              </button>
              <hr />
              <button
                type="button"
                className="agm-item"
                disabled={!model.text && model.values == null && !model.op}
                onClick={pick(() => setFilterModel(key, null))}
              >
                Clear filter
              </button>
              <button
                type="button"
                className="agm-item"
                onClick={pick(() => hideColumn(key))}
              >
                Hide column
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

/* ---------- Cell renderers ---------- */

const STATUS_COLORS = {
  approved: "success",
  accepted: "success",
  valid: "success",
  rejected: "danger",
  invalid: "danger",
  pending: "warning",
  review: "warning",
};

const renderFor = (key) => {
  if (key === "updatedAt" || key === "createdAt") {
    return ({ row }) => (row[key] ? new Date(row[key]).toLocaleString() : null);
  }
  if (key === "Status" || key === "EBB Status") {
    return ({ row }) => {
      const value = row[key];
      if (!value) return null;
      const color = STATUS_COLORS[String(value).toLowerCase()] ?? "secondary";
      return <span className={`dgp-pill dgp-pill-${color}`}>{value}</span>;
    };
  }
  if (/email/i.test(key)) {
    return ({ row }) =>
      row[key] ? <a href={`mailto:${row[key]}`}>{row[key]}</a> : null;
  }
  if (/link|website|linkedin/i.test(key)) {
    return ({ row }) => {
      const value = row[key];
      if (!value) return null;
      const href = /^https?:/i.test(value) ? value : `https://${value}`;
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {value}
        </a>
      );
    };
  }
  return undefined;
};
/* ---------- Card view + details modal ---------- */

const pillColor = (value) => {
  const v = String(value ?? "").toLowerCase();
  if (v === "qualified") return "success";
  if (v === "disqualified") return "danger";
  return STATUS_COLORS[v] ?? "secondary";
};

const initialsOf = (text) =>
  String(text || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

function RecordCard({
  row,
  cfg,
  fieldMap,
  selected,
  selectable,
  onToggle,
  onMore,
}) {
  const title = cfg.title(row);
  const subtitle = cfg.subtitle?.(row);
  const badge = cfg.badgeKey ? row[cfg.badgeKey] : null;
  function Avatar({ url, text }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [url]);

    if (url && !failed) {
      return (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      );
    }
    return initialsOf(text);
  }
  return (
    <article className={`dgp-card-item ${selected ? "is-selected" : ""}`}>
      <header className="dgp-ci-head">
        {selectable && (
          <input
            type="checkbox"
            className="dgp-ci-check"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${title}`}
          />
        )}
        <div className="dgp-ci-avatar" aria-hidden="true">
          <Avatar url={row.profilePhotoUrl} text={title} />
        </div>
        <div className="dgp-ci-id">
          <h3 title={title}>{title}</h3>
          {subtitle && <p title={subtitle}>{subtitle}</p>}
        </div>
        {badge && (
          <span className={`dgp-pill dgp-pill-${pillColor(badge)}`}>
            {badge}
          </span>
        )}
      </header>

      <dl className="dgp-ci-body">
        {cfg.items.map((key) => {
          const f = fieldMap.get(key);
          if (!f) return null;
          const render = renderFor(key);
          const value = row[key];
          return (
            <div key={key} className="dgp-ci-row">
              <dt>{f.name}</dt>
              <dd>
                {isBlankValue(value) ? (
                  <span className="dgp-ci-empty">—</span>
                ) : render ? (
                  render({ row })
                ) : (
                  String(value)
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <footer className="dgp-ci-foot">
        <span className="dgp-muted">
          {row.updatedAt
            ? `Updated ${new Date(row.updatedAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}`
            : ""}
        </span>
        <button type="button" className="dgp-btn dgp-btn-sm" onClick={onMore}>
          View more
        </button>
      </footer>
    </article>
  );
}

function RecordModal({ row, cfg, fields, onClose }) {
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!row) return null;

  const title = cfg.title(row);
  const subtitle = cfg.subtitle?.(row);
  const onCard = new Set(cfg.items);
  const rest = fields.filter((f) => !onCard.has(f.key));
  const visible = showEmpty
    ? rest
    : rest.filter((f) => !isBlankValue(row[f.key]));

  return createPortal(
    <div className="dgp-modal-backdrop" onClick={onClose}>
      <div
        className="dgp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dgp-modal-head">
          <div className="dgp-ci-avatar lg" aria-hidden="true">
            {initialsOf(title)}
          </div>
          <div className="dgp-ci-id">
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {cfg.badgeKey && row[cfg.badgeKey] && (
            <span
              className={`dgp-pill dgp-pill-${pillColor(row[cfg.badgeKey])}`}
            >
              {row[cfg.badgeKey]}
            </span>
          )}
          <button
            type="button"
            className="dgp-modal-x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="dgp-modal-tools">
          <label>
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => setShowEmpty(e.target.checked)}
            />{" "}
            Show empty fields
          </label>
          <span className="dgp-muted">{visible.length} fields</span>
        </div>

        <div className="dgp-modal-body">
          {visible.length === 0 && (
            <div className="dgp-muted">No additional details.</div>
          )}
          {visible.map((f) => {
            const render = renderFor(f.key);
            const value = row[f.key];
            return (
              <div key={f.key} className="dgp-md-row">
                <dt>{f.name}</dt>
                <dd>
                  {isBlankValue(value) ? (
                    <span className="dgp-ci-empty">—</span>
                  ) : render ? (
                    render({ row })
                  ) : (
                    String(value)
                  )}
                </dd>
              </div>
            );
          })}
        </div>

        <footer className="dgp-modal-foot">
          <button type="button" className="dgp-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
/* ---------- Page ---------- */

const NO_FIXED_FILTERS = {};
const NO_SORT = [];
export default function DataGridPage({
  resource,
  title,
  fields,
  fixedFilters = NO_FIXED_FILTERS,
  cardConfig,
  defaultSort = NO_SORT,
}) {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const dataState = useSelector((state) => state.data);
  const isDark = useIsDark();
  const rows = dataState[resource] ?? [];
  const pagination = dataState.pagination?.[resource] ?? {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };
  const loading = dataState.loading;
  const error = dataState.error;
  const canEdit = can(user, resource, "edit");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortColumns, setSortColumns] = useState([
  {
    columnKey: "updatedAt", // Use the exact Updated At field key
    direction: "DESC",
  },
]);
  const [filterModels, setFilterModels] = useState({});
  const [filters, setFilters] = useState({});
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(() =>
    fields.map((f) => f.key),
  );
  const [columnOrder, setColumnOrder] = useState(() =>
    fields.map((f) => f.key),
  );
  const [importOpen, setImportOpen] = useState(false);
  const [exportBytes, setExportBytes] = useState(0);
  const sortBy = sortColumns[0]?.columnKey ?? "";

  const sortOrder = sortColumns[0]?.direction === "DESC" ? "desc" : "asc";
  
  const [exportStatus, setExportStatus] = useState("");
  const [companyList, setCompanyList] = useState(null); // { listId, domainCount, nameCount, fileName }
  const [listError, setListError] = useState("");
  const listInputRef = useRef(null);
  const [showListModal, setShowListModal] = useState(false);
  const [view, setView] = useState("table"); // "table" | "card"
  const [detailRow, setDetailRow] = useState(null);
  const fieldMap = useMemo(
    () => new Map(fields.map((f) => [f.key, f])),
    [fields],
  );

  const cardCfg = useMemo(
    () =>
      cardConfig ?? {
        title: (r) => String(r[fields[0]?.key] ?? "—"),
        subtitle: null,
        badgeKey: null,
        items: fields.slice(1, 7).map((f) => f.key),
      },
    [cardConfig, fields],
  );
  const [selectedRows, setSelectedRows] = useState(() => new Set()); // set of row _id

  const selectedCache = useRef(new Map()); // _id -> full row object
  const [linkedinBusy, setLinkedinBusy] = useState(false);
  // Column filters typed by the user + locked filters from the URL (locked ones win).
  const fixedKey = JSON.stringify(fixedFilters);
  const [linkedinStatus, setLinkedinStatus] = useState("");
  const [linkedinJob, setLinkedinJob] = useState(null);
  const [linkedinQueue, setLinkedinQueue] = useState([]);

  /* ---- Toasts ---- */
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const [colQuery, setColQuery] = useState("");
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [highlightKey, setHighlightKey] = useState(null);
  const [pendingScroll, setPendingScroll] = useState(null);
  const gridWrapRef = useRef(null);
  const [colActive, setColActive] = useState(0);
  const colFindRef = useRef(null);
  const [logOpen, setLogOpen] = useState(false);
  
  const dismissToast = useCallback(
    (id) => setToasts((current) => current.filter((t) => t.id !== id)),
    [],
  );

  // type: "success" | "error" | "warning" | "info"
  const showToast = useCallback(
    (message, type = "info", duration = 4500) => {
      const id = ++toastId.current;
      setToasts((current) => [...current.slice(-3), { id, message, type }]);
      setTimeout(() => dismissToast(id), duration);
    },
    [dismissToast],
  );

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      ...(companyList
        ? { companyListId: { op: "equals", text: companyList.listId } }
        : {}),
      ...fixedFilters,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, fixedKey, companyList],
  );

  // Go back to page 1 when the dashboard link (status / employee) changes.
  useEffect(() => {
    setPage(1);
  }, [fixedKey]);

  // Debounced global search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    setSelectedRows(new Set());
  }, [resource, search, effectiveFilters]);
  // Debounced column filters -> server filter model
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = {};
      for (const [key, m] of Object.entries(filterModels)) {
        const op = m.op ?? "contains";
        const text = needsText(op) ? (m.text ?? "").trim() : "";
        const hasText = needsText(op) ? Boolean(text) : true;
        const hasValues = m.values != null;
        if (!hasText && !hasValues) continue;
        next[key] = { op, text, values: m.values ?? null };
      }
      setFilters((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [filterModels]);

  useEffect(() => {
    dispatch(
      fetchRows({
        resource,
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        filters: effectiveFilters,
      }),
    );
  }, [
    dispatch,
    resource,
    page,
    limit,
    search,
    sortBy,
    sortOrder,
    effectiveFilters,
  ]);

  // Refs keep fetchDistinct stable so the open filter popup does not refetch on every keystroke.
  const searchRef = useRef("");
  const filtersRef = useRef({});
  searchRef.current = search;
  filtersRef.current = effectiveFilters;

  const fetchDistinct = useCallback(
    (key, valueSearch) => {
      // The checklist ignores this column's own filter so all of its values stay visible.
      const { [key]: _own, ...others } = filtersRef.current;
      return getDistinctApi(resource, key, {
        search: searchRef.current,
        filters: others,
        valueSearch,
      });
    },
    [resource],
  );
  const STATUS_KEY = "status";
  const hasStatusField = fieldMap.has(STATUS_KEY);
  const statusLocked = Boolean(fixedFilters[STATUS_KEY]); // e.g. ?status=Qualified in the URL
  const [statusOptions, setStatusOptions] = useState([]);

  useEffect(() => {
    if (view !== "card" || !hasStatusField || statusLocked) return;
    let cancelled = false;
    fetchDistinct(STATUS_KEY, "")
      .then((res) => {
        if (!cancelled)
          setStatusOptions((res?.values ?? []).filter((v) => !isBlankValue(v)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view, hasStatusField, statusLocked, fetchDistinct]);

  const activeStatus =
    filterModels[STATUS_KEY]?.op === "equals"
      ? (filterModels[STATUS_KEY].text ?? "")
      : "";

  const pickStatus = (value) =>
    headerCtx.setFilterModel(
      STATUS_KEY,
      value ? { op: "equals", text: value, values: null } : null,
    );
  // Fields in the user's chosen order (new fields that appear later are appended).
  const orderedFields = useMemo(() => {
    const byKey = new Map(fields.map((f) => [f.key, f]));
    const ordered = columnOrder
      .filter((k) => byKey.has(k))
      .map((k) => byKey.get(k));
    const missing = fields.filter((f) => !columnOrder.includes(f.key));
    return [...ordered, ...missing];
  }, [fields, columnOrder]);

  // Move `sourceKey` into the position currently held by `targetKey`.
  const moveColumn = useCallback(
    (sourceKey, targetKey) =>
      setColumnOrder((current) => {
        const all = [
          ...current,
          ...fields.map((f) => f.key).filter((k) => !current.includes(k)),
        ];
        const from = all.indexOf(sourceKey);
        const to = all.indexOf(targetKey);
        if (from < 0 || to < 0 || from === to) return current;
        const next = [...all];
        next.splice(from, 1);
        next.splice(to, 0, sourceKey);
        return next;
      }),
    [fields],
  );

  // Nudge a column one step left (-1) or right (+1) among the visible columns.
  const shiftColumn = (key, delta) => {
    const visible = orderedFields.filter((f) => visibleKeys.includes(f.key));
    const i = visible.findIndex((f) => f.key === key);
    const target = visible[i + delta];
    if (target) moveColumn(key, target.key);
  };

  const headerCtx = useMemo(
    () => ({
      sortColumns,
      setSort: (key, direction) => {
        setSortColumns(direction ? [{ columnKey: key, direction }] : []);
        setPage(1);
      },
      filterModels,
      setFilterModel: (key, patch) =>
        setFilterModels((current) => {
          if (patch === null) {
            const { [key]: _removed, ...rest } = current;
            return rest;
          }
          return { ...current, [key]: { ...current[key], ...patch } };
        }),
      fetchDistinct,
      hideColumn: (key) =>
        setVisibleKeys((current) => current.filter((k) => k !== key)),
      moveColumn,
    }),
    [sortColumns, filterModels, fetchDistinct, moveColumn],
  );

  const columns = useMemo(() => {
    const offset = (pagination.page - 1) * pagination.limit;

    const selectCol = {
      ...SelectColumn,
      width: 48,
      minWidth: 48,
      maxWidth: 48,
      resizable: false,
      frozen: true,
      cellClass: "dgp-center-cell",
      headerCellClass: "dgp-center-cell",
    };

    const rowNumber = {
      key: "__index",
      name: "Sr. No.",
      width: 80,
      minWidth: 80,
      maxWidth: 80,
      frozen: true,
      resizable: false,
      sortable: false,
      cellClass: "dgp-center-cell",
      headerCellClass: "dgp-center-cell",
      renderHeaderCell: () => <div className="agh agh-index">Sr. No.</div>,
      renderCell: ({ rowIdx }) => (
        <span className="text-muted">{offset + rowIdx + 1}</span>
      ),
    };

    const dataCols = orderedFields
      .filter((field) => visibleKeys.includes(field.key))
      .map((field) => {
        const sticky =
          resource === "prospect" && STICKY_NAME_KEYS.has(normKey(field.key));
        return {
          key: field.key,
          name: field.name,
          minWidth: 180,
          width: sticky ? 200 : 220,
          frozen: sticky,
          resizable: true,
          sortable: false,
          cellClass: field.key === highlightKey ? "dgp-col-hl" : undefined,
          headerCellClass:
            field.key === highlightKey ? "dgp-col-hl-head" : undefined,
          renderHeaderCell: (props) => <HeaderCell {...props} />,
          renderCell: renderFor(field.key),
          renderEditCell: canEdit ? textEditor : undefined,
        };
      });

    // frozen columns must come first in the array
    const stickyCols = dataCols.filter((c) => c.frozen);
    const otherCols = dataCols.filter((c) => !c.frozen);

    return [selectCol, rowNumber, ...stickyCols, ...otherCols];
  }, [
    orderedFields,
    visibleKeys,
    canEdit,
    resource,
    pagination.page,
    pagination.limit,
    highlightKey,
  ]);

  const colMatches = useMemo(() => {
    const q = colQuery.trim().toLowerCase();
    if (!q) return [];
    return orderedFields
      .filter((f) => f.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [colQuery, orderedFields]);

  useEffect(() => {
    const onDown = (e) => {
      if (colFindRef.current && !colFindRef.current.contains(e.target)) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const goToColumn = (key) => {
    const field = fields.find((f) => f.key === key);
    if (!field) return;
    if (!visibleKeys.includes(key)) setVisibleKeys((c) => [...c, key]);
    setHighlightKey(key);
    setPendingScroll(key);
    setColQuery(field.name);
    setColMenuOpen(false);
  };

  // Scroll after the columns array has been rebuilt (a hidden column may have just been shown).
  useEffect(() => {
    if (!pendingScroll) return;
    const idx = columns.findIndex((c) => c.key === pendingScroll);
    if (idx < 0) return;

    const widthOf = (c) => (typeof c.width === "number" ? c.width : 220);
    const frozenWidth = columns
      .filter((c) => c.frozen)
      .reduce((sum, c) => sum + widthOf(c), 0);
    const left = columns.slice(0, idx).reduce((sum, c) => sum + widthOf(c), 0);

    const grid = gridWrapRef.current?.querySelector(".rdg");
    if (grid && !columns[idx].frozen) {
      grid.scrollTo({
        left: Math.max(0, left - frozenWidth - 8),
        behavior: "smooth",
      });
    }
    setPendingScroll(null);
  }, [pendingScroll, columns]);
  const clearSelection = useCallback(() => {
    selectedCache.current.clear();
    setSelectedRows(new Set());
  }, []);

  const handleSelectedRowsChange = (next) => {
    let finalSet = next;

    if (next.size > MAX_SELECT) {
      // keep what was already selected, then fill up to the limit
      const kept = new Set();
      for (const id of selectedRows) {
        if (next.has(id) && kept.size < MAX_SELECT) kept.add(id);
      }
      for (const id of next) {
        if (kept.size >= MAX_SELECT) break;
        kept.add(id);
      }
      finalSet = kept;
      showToast(
        `You can select a maximum of ${MAX_SELECT} records at a time.`,
        "warning",
      );
    }

    // remember the full row for everything newly ticked on this page
    rows.forEach((r) => {
      if (finalSet.has(r._id)) selectedCache.current.set(r._id, r);
    });
    // forget anything that was unticked
    for (const id of Array.from(selectedCache.current.keys())) {
      if (!finalSet.has(id)) selectedCache.current.delete(id);
    }
    setSelectedRows(finalSet);
  };
  const toggleCardSelect = (row) => {
    const next = new Set(selectedRows);
    if (next.has(row._id)) next.delete(row._id);
    else next.add(row._id);
    handleSelectedRowsChange(next);
  };

  const selectableCards = resource === "prospect" && canEdit;
  const pageIds = rows.map((r) => r._id);
  const allOnPage =
    pageIds.length > 0 && pageIds.every((id) => selectedRows.has(id));
  const someOnPage = pageIds.some((id) => selectedRows.has(id));

  const toggleSelectAllCards = () => {
    const next = new Set(selectedRows);
    if (allOnPage) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    handleSelectedRowsChange(next); // keeps the MAX_SELECT limit and the row cache working
  };
  const changeView = (next) => {
    if (next === view) return;
    setView(next);
    setLimit(next === "card" ? 12 : 25); // card grids look best in multiples of 3/4
    setPage(1);
  };
  // Full records of the selected rows
  const getSelectedRecords = () =>
    Array.from(selectedRows)
      .map((id) => selectedCache.current.get(id))
      .filter(Boolean);
  useEffect(() => {
    clearSelection();
  }, [resource, search, effectiveFilters, clearSelection]);

  const reloadCurrentPage = () =>
    dispatch(
      fetchRows({
        resource,
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        filters: effectiveFilters,
      }),
    );

  // always points to the newest reload function
  const reloadRef = useRef(reloadCurrentPage);
  reloadRef.current = reloadCurrentPage;
  const pollRunRef = useRef(0);
  const downloadJobLog = async () => {
    try {
      const blob = await exportLinkedinLogsApi({ jobId: linkedinJob.jobId });
      saveBlob(
        blob,
        `linkedin-update-log-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      console.error("Log download failed:", err);
      showToast(
        err?.response?.data?.message || err.message || "Log download failed.",
        "error",
        6000,
      );
    }
  };

// One polling loop, used for both a fresh start and a resume after refresh.
const runLinkedinJob = async (jobId, total) => {
  const runId = ++pollRunRef.current;
  const isCurrent = () => pollRunRef.current === runId;

  setLinkedinBusy(true);
  try {
    let last = null;
    let seen = 0;

    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      if (!isCurrent()) return;

      const s = await getLinkedinUpdateStatusApi(jobId);
      if (!isCurrent()) return;

      const results = Array.isArray(s.results) ? s.results : [];
      setLinkedinJob((j) => ({
        ...s,
        results,
        queue: j?.queue ?? [],
        jobId: j?.jobId ?? jobId,
      }));
      setLinkedinStatus(`Updating... ${s.processed ?? 0}/${s.total ?? total}`);

      if (results.length > seen) {
        seen = results.length;
        reloadRef.current();
      }

      if (s.state === "failed") {
        clearJobMeta();
        throw new Error(s.error || "LinkedIn update failed");
      }
      if (s.state === "done" || s.state === "stopped") {
        clearJobMeta(); // finished: a refresh will now hide the table
        last = s;
        break;
      }
    }

    const results = Array.isArray(last?.results) ? last.results : [];
    const notUpdated = results.filter(
      (r) => r.status === "skipped" || r.status === "failed",
    ).length;
    const updated = results.length - notUpdated;

    if (last?.state === "stopped") {
      showToast(
        `${last.error || "LinkedIn update stopped early."} (${updated} updated, ${notUpdated} skipped or failed)`,
        "warning",
        9000,
      );
    } else if (results.length && notUpdated === results.length) {
      showToast(
        `No profiles were updated. ${notUpdated} record(s) were skipped or failed.`,
        "warning",
        7000,
      );
    } else if (results.length && notUpdated > 0) {
      showToast(
        `LinkedIn update finished: ${updated} updated, ${notUpdated} skipped or failed.`,
        "info",
        7000,
      );
    } else {
      showToast(`LinkedIn profiles updated for ${total} record(s).`, "success");
    }
  } catch (err) {
    if (!isCurrent()) return;
    if (err?.response?.status === 404) clearJobMeta(); // server no longer knows this job
    setLinkedinJob((j) =>
      j ? { ...j, state: "failed", error: err.message } : j,
    );
    reloadRef.current();
    showToast(
      err?.response?.data?.message ||
        err.message ||
        "Could not update LinkedIn profiles.",
      "error",
      7000,
    );
  } finally {
    if (isCurrent()) {
      setLinkedinBusy(false);
      setLinkedinStatus("");
    }
  }
};

const updateLinkedinProfiles = async () => {
  const records = getSelectedRecords();
  if (!records.length) return;

  const queue = records.map((r) => ({ id: String(r._id), name: nameOfRecord(r) }));

  setLinkedinQueue(queue);
  setLinkedinBusy(true);
  setLinkedinStatus("Starting...");
  setLinkedinJob({
    state: "running",
    total: records.length,
    processed: 0,
    current: "",
    results: [],
    error: null,
    queue,
  });

  try {
    const started = await updateLinkedinProfilesApi(resource, records);
    const jobId = started.jobId ?? started.job_id;
    if (!jobId) throw new Error("No job id returned.");

    saveJobMeta({ jobId, total: records.length, queue }); // survives refresh
    setLinkedinJob((j) => (j ? { ...j, jobId } : j));
    clearSelection();

    await runLinkedinJob(jobId, records.length);
  } catch (err) {
    setLinkedinBusy(false);
    setLinkedinStatus("");
    setLinkedinJob((j) =>
      j ? { ...j, state: "failed", error: err.message } : j,
    );
    showToast(
      err?.response?.data?.message || err.message || "Could not start the LinkedIn update.",
      "error",
      7000,
    );
  }
};

// After a page refresh, pick the running job back up.
useEffect(() => {
  if (resource !== "prospect") return;
  const meta = loadJobMeta();
  if (!meta?.jobId) return;

  const queue = Array.isArray(meta.queue) ? meta.queue : [];
  setLinkedinQueue(queue);
  setLinkedinJob({
    state: "running",
    total: meta.total ?? queue.length,
    processed: 0,
    current: "",
    results: [],
    error: null,
    queue,
    jobId: meta.jobId,
  });
  runLinkedinJob(meta.jobId, meta.total ?? queue.length);

  return () => {
    pollRunRef.current++; // stop the loop when leaving the page
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [resource]);

  const onRowsChange = (newRows, { indexes }) => {
    indexes.forEach((index) => {
      const row = newRows[index];
      const previous = rows[index];
      if (!row?._id || !previous) return;

      // Only send the fields that actually changed.
      const changes = Object.fromEntries(
        fields
          .filter((f) => row[f.key] !== previous[f.key])
          .map((f) => [f.key, row[f.key]]),
      );
      if (!Object.keys(changes).length) return;

      dispatch(patchLocal({ resource, id: row._id, changes }));
      dispatch(updateRow({ resource, id: row._id, changes }));
    });
  };

  const exportExcel = async () => {
    setExporting(true);
    setExportStatus("Preparing export...");
    try {
      const exportColumns = orderedFields
        .filter((f) => visibleKeys.includes(f.key))
        .map((f) => ({ key: f.key, name: f.name }));

      const { jobId } = await exportStartApi(resource, {
        search,
        sortBy,
        sortOrder,
        filters: effectiveFilters,
        columns: exportColumns,
      });

      // Poll every second until the file is ready.
      for (;;) {
        await new Promise((r) => setTimeout(r, 1000));
        const s = await exportStatusApi(resource, jobId);
        if (s.state === "failed") throw new Error(s.error || "Export failed");
        if (s.state === "done") break;
        setExportStatus(`Exporting... ${s.processed.toLocaleString()} rows`);
      }

      setExportStatus("Downloading...");
      const blob = await exportFileApi(resource, jobId);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${resource}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Export downloaded.", "success");
    } catch {
      showToast("Export failed. Please try again.", "error", 6000);
    } finally {
      setExporting(false);
      setExportStatus("");
    }
  };

  const onImported = () => {
    // Reload the current view (the fetch effect will not re-run if page/filters are unchanged).
    setPage(1);
    dispatch(
      fetchRows({
        resource,
        page: 1,
        limit,
        search,
        sortBy,
        sortOrder,
        filters: effectiveFilters,
      }),
    );
  };

  const addBlank = () => {
    dispatch(
      addRow({
        resource,
        row: Object.fromEntries(fields.map((f) => [f.key, ""])),
      }),
    );
  };

  const toggleColumn = (key) =>
    setVisibleKeys((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );
  useEffect(() => {
    setPage(1);
  }, [companyList]);

  const onPickCompanyList = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setListError("");
    try {
      const res = await uploadCompanyListApi(file);
      setCompanyList({ ...res, fileName: file.name });
    } catch (err) {
      setListError(err?.response?.data?.message || "Could not read the file.");
    }
  };
  // Clears only the user's own filters; the locked URL filters stay.
  const clearAll = () => {
    setFilterModels({});
    setSearchInput("");
    setSortColumns([]);
  };
  const sortChanged =
    JSON.stringify(sortColumns) !== JSON.stringify(defaultSort);

  const activeCount =
    Object.keys(filters).length +
    (search ? 1 : 0) +
    (sortColumns.length ? 1 : 0);
  const startRecord = pagination.total
    ? (pagination.page - 1) * pagination.limit + 1
    : 0;
  const endRecord = Math.min(
    pagination.page * pagination.limit,
    pagination.total,
  );
  const totalPages = Math.max(1, pagination.totalPages);

  return (
    <section className="dgp">
      <Toaster toasts={toasts} onClose={dismissToast} />

      <div className="dgp-card dgp-head">
        <div>
          <h2 className="dgp-title">{title}</h2>
          <span className="dgp-badge">
            {pagination.total.toLocaleString()} total records
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {resource === "prospect" && canEdit && (
            <button
              type="button"
              className="dgp-btn dgp-btn-primary"
              onClick={() => setShowImport(true)}
            >
              Import Excel
            </button>
          )}

          {resource === "company" && canEdit && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Import Excel
            </button>
          )}

          {(resource === "prospect" || resource === "company") && (
            <button
              type="button"
              className="dgp-btn"
              onClick={() => setShowListModal(true)}
            >
              Filter by company list
            </button>
          )}

          {resource === "prospect" && canEdit && selectedRows.size > 0 && (
            <button
              type="button"
              className="dgp-btn dgp-btn-primary"
              onClick={updateLinkedinProfiles}
              disabled={linkedinBusy}
            >
              {linkedinBusy
                ? linkedinStatus || "Updating..."
                : `Update LinkedIn Profile (${selectedRows.size})`}
            </button>
          )}
          {selectedRows.size > 0 && (
            <button
              type="button"
              className="dgp-btn"
              onClick={() => setSelectedRows(new Set())}
            >
              Clear selection
            </button>
          )}
        </div>

        <CompanyListModal
          open={showListModal}
          onClose={() => setShowListModal(false)}
          onApplied={setCompanyList}
        />

        {showImport && (
          <ImportExcelModal
            onClose={() => setShowImport(false)}
            onImported={onImported}
          />
        )}
      </div>
      {linkedinJob && (
        <div className="dgp-card" style={{ padding: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <strong>
              LinkedIn update: {linkedinJob.processed ?? 0}/{linkedinJob.total}
              {linkedinJob.state === "done" && " ✓ finished"}
              {linkedinJob.state === "stopped" && " (stopped)"}
              {linkedinJob.state === "failed" && " (failed)"}
            </strong>
            {!linkedinBusy && (
              <div style={{ display: "flex", gap: 8 }}>
                {linkedinJob.jobId && (
                  <button
                    type="button"
                    className="dgp-btn dgp-btn-sm dgp-btn-success"
                    onClick={downloadJobLog}
                  >
                    Download log
                  </button>
                )}
                <button
                  type="button"
                  className="dgp-btn dgp-btn-sm"
                  onClick={() => setLinkedinJob(null)}
                >
                  Close
                </button>
              </div>
            )}
          </div>

          <div
            style={{
              height: 8,
              background: "#e5e7eb",
              borderRadius: 4,
              overflow: "hidden",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: `${linkedinJob.total ? ((linkedinJob.processed ?? 0) / linkedinJob.total) * 100 : 0}%`,
                height: "100%",
                background: "#4f46e5",
                transition: "width .3s",
              }}
            />
          </div>

          {linkedinJob.error && (
            <div className="dgp-alert">{linkedinJob.error}</div>
          )}

          <div className="w-full max-h-[420px] overflow-y-auto overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-[13px] border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800">
                <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                  <th className="p-2">#</th>
                  <th className="p-2">Prospect</th>
                  <th className="p-2">Result</th>
                  <th className="p-2">Details</th>
                </tr>
              </thead>

              <tbody>
                {linkedinQueue.map((q, i) => {
                  const matchFor = (item, idx) =>
                    linkedinJob.results.find(
                      (r) => String(r.id) === String(item.id),
                    ) ?? linkedinJob.results[idx];

                  const res = matchFor(q, i);
                  const finished = ["done", "stopped", "failed"].includes(
                    linkedinJob.state,
                  );

                  const firstOpen = linkedinQueue.findIndex(
                    (x, idx) => !matchFor(x, idx),
                  );

                  const isCurrent = !res && !finished && i === firstOpen;

                  let label = "Pending";
                  let color = "secondary";

                  if (res) {
                    label = res.status;
                    color =
                      res.status === "failed" || res.status === "disqualified"
                        ? "danger"
                        : res.status === "skipped"
                          ? "warning"
                          : "success";
                  } else if (isCurrent) {
                    label = "Updating...";
                    color = "warning";
                  } else if (finished) {
                    label = "Not processed";
                  }

                  return (
                    <tr
                      key={q.id}
                      className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/70"
                    >
                      <td className="p-2">{i + 1}</td>

                      <td className="p-2 whitespace-nowrap text-gray-900 dark:text-gray-100">
                        {res?.name || q.name}
                      </td>

                      <td className="p-2 whitespace-nowrap">
                        <span className={`dgp-pill dgp-pill-${color}`}>
                          {label}
                        </span>
                      </td>

                      <td className="p-2 min-w-[200px] text-gray-600 dark:text-gray-300">
                        {res
                          ? res.summary ||
                            (typeof res.detail === "string" ? res.detail : "")
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {linkedinJob.state === "running" &&
            linkedinJob.total -
              linkedinJob.results.length -
              (linkedinJob.current ? 1 : 0) >
              0 && (
              <div className="dgp-muted" style={{ marginTop: 8 }}>
                {linkedinJob.total -
                  linkedinJob.results.length -
                  (linkedinJob.current ? 1 : 0)}{" "}
                waiting
              </div>
            )}
        </div>
      )}

      <CompanyImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() =>
          dispatch(fetchRows({ resource: "company", page: 1, limit: 10 }))
        }
      />
      <div className="dgp-card">
        <div className="dgp-toolbar">
          <div className="dgp-search">
            <span className="dgp-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              className="dgp-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`Search all ${title.toLowerCase()}...`}
              aria-label={`Search ${title}`}
            />
          </div>
          <div className="dgp-colfind" ref={colFindRef}>
            <input
              type="text"
              className="dgp-input"
              value={colQuery}
              placeholder="Find column..."
              aria-label="Find column"
              autoComplete="off"
              onChange={(e) => {
                setColQuery(e.target.value);
                setColActive(0);
                setColMenuOpen(true);
                if (!e.target.value) setHighlightKey(null);
              }}
              onFocus={() => setColMenuOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setColMenuOpen(true);
                  setColActive((i) => Math.min(i + 1, colMatches.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setColActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const m = colMatches[colActive];
                  if (m) goToColumn(m.key);
                } else if (e.key === "Escape") {
                  setColMenuOpen(false);
                  setColQuery("");
                  setHighlightKey(null);
                }
              }}
            />

            {highlightKey && (
              <button
                type="button"
                className="dgp-link"
                onClick={() => {
                  setHighlightKey(null);
                  setColQuery("");
                }}
              >
                Clear
              </button>
            )}

            {colMenuOpen && colMatches.length > 0 && (
              <div className="dgp-colfind-list" role="listbox">
                {colMatches.map((f, i) => (
                  <button
                    key={f.key}
                    type="button"
                    role="option"
                    aria-selected={i === colActive}
                    className={`dgp-colfind-item ${i === colActive ? "active" : ""}`}
                    ref={(el) => {
                      if (el && i === colActive)
                        el.scrollIntoView({ block: "nearest" });
                    }}
                    onMouseEnter={() => setColActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep the input focused, select on press
                      goToColumn(f.key);
                    }}
                  >
                    {f.name}
                    {!visibleKeys.includes(f.key) && <em> (hidden)</em>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="dgp-tools">
            <div className="dgp-viewtoggle" role="group" aria-label="View">
              <button
                type="button"
                className={view === "card" ? "on" : ""}
                onClick={() => changeView("card")}
              >
                Cards
              </button>
              <button
                type="button"
                className={view === "table" ? "on" : ""}
                onClick={() => changeView("table")}
              >
                Table
              </button>
            </div>
            {activeCount > 0 && (
              <button type="button" className="dgp-btn" onClick={clearAll}>
                Reset ({activeCount})
              </button>
            )}

            <button
              type="button"
              className="dgp-btn dgp-btn-success"
              onClick={exportExcel}
              disabled={exporting || pagination.total === 0}
              title="Download all rows matching the current search, sort and filters"
            >
              {exporting
                ? exportStatus || "Exporting..."
                : `Export Excel (${pagination.total.toLocaleString()})`}
            </button>

            <div className="dgp-menu-wrap">
              <button
                type="button"
                className="dgp-btn"
                onClick={() => setShowColumnsMenu((open) => !open)}
                aria-expanded={showColumnsMenu}
              >
                Columns ▾
              </button>

              {showColumnsMenu && (
                <>
                  <div
                    className="agm-backdrop"
                    onClick={() => setShowColumnsMenu(false)}
                  />
                  <div className="dgp-colmenu">
                    <div className="dgp-colmenu-head">
                      <strong>Show, hide &amp; reorder</strong>
                      <span>
                        <button
                          type="button"
                          className="dgp-link"
                          onClick={() =>
                            setVisibleKeys(fields.map((f) => f.key))
                          }
                        >
                          Show all
                        </button>
                        {" · "}
                        <button
                          type="button"
                          className="dgp-link"
                          onClick={() =>
                            setColumnOrder(fields.map((f) => f.key))
                          }
                        >
                          Reset order
                        </button>
                      </span>
                    </div>
                    <div className="dgp-colmenu-list">
                      {orderedFields.map((field) => (
                        <div key={field.key} className="dgp-colopt">
                          <label className="dgp-colopt-label">
                            <input
                              type="checkbox"
                              checked={visibleKeys.includes(field.key)}
                              onChange={() => toggleColumn(field.key)}
                            />
                            <span>{field.name}</span>
                          </label>
                          <button
                            type="button"
                            className="dgp-colmove"
                            aria-label={`Move ${field.name} left`}
                            title="Move left"
                            disabled={!visibleKeys.includes(field.key)}
                            onClick={() => shiftColumn(field.key, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="dgp-colmove"
                            aria-label={`Move ${field.name} right`}
                            title="Move right"
                            disabled={!visibleKeys.includes(field.key)}
                            onClick={() => shiftColumn(field.key, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {view === "card" && (
              <label className="dgp-rows">
                Sort
                <select
                  className="dgp-select"
                  value={sortBy}
                  onChange={(e) =>
                    headerCtx.setSort(
                      e.target.value,
                      e.target.value
                        ? (sortColumns[0]?.direction ?? "DESC")
                        : null,
                    )
                  }
                >
                  <option value="">Default</option>
                  {orderedFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="dgp-btn dgp-btn-sm"
                  disabled={!sortBy}
                  onClick={() =>
                    headerCtx.setSort(
                      sortBy,
                      sortOrder === "desc" ? "ASC" : "DESC",
                    )
                  }
                >
                  {sortOrder === "desc" ? "↓ Desc" : "↑ Asc"}
                </button>
              </label>
            )}
          </div>
        </div>

        {error && <div className="dgp-alert">{String(error)}</div>}

        <div
          ref={gridWrapRef}
          className={`dgp-grid ${view === "card" ? "is-cards" : ""} ${loading ? "is-loading" : ""}`}
        >
          <HeaderCtx.Provider value={headerCtx}>
            {listError && <div className="dgp-alert">{listError}</div>}
            {companyList && (
              <div className="dgp-chip">
                Company list: {companyList.fileName} ({companyList.domainCount}{" "}
                domains, {companyList.nameCount} names)
                <button
                  type="button"
                  className="dgp-link"
                  onClick={() => setCompanyList(null)}
                >
                  Clear
                </button>
              </div>
            )}

            {view === "table" ? (
              <DataGrid
                className={`${isDark ? "rdg-dark" : "rdg-light"} ag-like`}
                columns={columns}
                rows={rows}
                rowKeyGetter={(row) => row._id}
                selectedRows={selectedRows}
                onSelectedRowsChange={handleSelectedRowsChange}
                onRowsChange={onRowsChange}
                rowHeight={42}
                headerRowHeight={84}
                rowClass={(_, index) => (index % 2 ? "ag-row-alt" : undefined)}
                defaultColumnOptions={{ resizable: true }}
              />
            ) : (
              <>
                {hasStatusField &&
                  !statusLocked &&
                  statusOptions.length > 0 && (
                    <div
                      className="dgp-statusbar"
                      role="group"
                      aria-label="Filter by status"
                    >
                      <button
                        type="button"
                        className={`dgp-chipbtn ${activeStatus === "" ? "on" : ""}`}
                        onClick={() => pickStatus("")}
                      >
                        All
                      </button>
                      {statusOptions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`dgp-chipbtn ${activeStatus === String(s) ? "on" : ""}`}
                          onClick={() => pickStatus(String(s))}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                {selectableCards && rows.length > 0 && (
                  <div className="dgp-cards-bar">
                    <label className="dgp-cards-selectall">
                      <input
                        type="checkbox"
                        checked={allOnPage}
                        ref={(el) => {
                          if (el) el.indeterminate = someOnPage && !allOnPage;
                        }}
                        onChange={toggleSelectAllCards}
                      />
                      <span>Select all on this page ({rows.length})</span>
                    </label>
                    {selectedRows.size > 0 && (
                      <span className="dgp-muted">
                        {selectedRows.size} selected
                      </span>
                    )}
                  </div>
                )}

                <div className="dgp-cards">
                  {rows.map((row) => (
                    <RecordCard
                      key={row._id}
                      row={row}
                      cfg={cardCfg}
                      fieldMap={fieldMap}
                      selectable={selectableCards}
                      selected={selectedRows.has(row._id)}
                      onToggle={() => toggleCardSelect(row)}
                      onMore={() => setDetailRow(row)}
                    />
                  ))}
                </div>
              </>
            )}
          </HeaderCtx.Provider>

          {loading && (
            <div className="dgp-loader" role="status" aria-live="polite">
              <span className="dgp-spinner" />
              <span className="dgp-loader-text">Loading data...</span>
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="dgp-empty">
              No records match your search or filters.
            </div>
          )}
        </div>

        <div className="dgp-foot">
         <div className="flex flex-wrap items-center gap-3">
   <label className="flex items-center gap-2 text-sm">
  <span>Rows per page:</span>
  <select
    value={limit}
    disabled={loading}
    onChange={(e) => {
      setLimit(Number(e.target.value));
      setPage(1);
    }}
    className="rounded-md border border-gray-300 bg-white px-2 py-1.5
      text-sm text-gray-900 outline-none focus:border-indigo-500
      dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
  >
    {(view === "card" ? [12, 24, 48, 96] : [10, 25, 50, 100]).map(
      (size) => (
        <option key={size} value={size}>
          {size}
        </option>
      )
    )}
  </select>
</label>
    <span className="dgp-muted">
      Showing {startRecord.toLocaleString()}–
      {endRecord.toLocaleString()} of{" "}
      {pagination.total.toLocaleString()}
    </span>
  </div>

          <nav className="dgp-pager" aria-label="Pagination">
            <button
              type="button"
              className="dgp-pg"
              disabled={!pagination.hasPrevPage || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹ Prev
            </button>

            {pageList(pagination.page, totalPages).map((n, i) =>
              n === "…" ? (
                <span key={`gap-${i}`} className="dgp-pg-gap">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  className={`dgp-pg ${n === pagination.page ? "on" : ""}`}
                  aria-current={n === pagination.page ? "page" : undefined}
                  disabled={loading}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ),
            )}

            <button
              type="button"
              className="dgp-pg"
              disabled={!pagination.hasNextPage || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next ›
            </button>
          </nav>
        </div>
      </div>
      {detailRow && (
        <RecordModal
          row={detailRow}
          cfg={cardCfg}
          fields={orderedFields}
          onClose={() => setDetailRow(null)}
        />
      )}
    </section>
  );
}
