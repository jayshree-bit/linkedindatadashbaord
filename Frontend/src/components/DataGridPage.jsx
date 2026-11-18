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
  deleteDisqualified,
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
import ChangeDiff from "./ChangeDiff";
// Shared UI: toast messages + confirmation modal (adjust the path if needed)
import { useToast, useConfirm } from "./Feedbackprovider";

/* ---------- Filter model helpers ---------- */

const OPERATORS = [
  { id: "dateRange", label: "Date range", text: false, dateOnly: true },
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
const labelOf = (v, isDate = false) => {
  if (isBlankValue(v)) return "(Blanks)";
  if (isDate) {
    const date = new Date(v);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-IN", { timeZone: "UTC" });
    }
  }
  return String(v);
};
const isAdvanced = (m) =>
  Boolean(m) && (m.values != null || (m.op && m.op !== "contains"));
const isDateField = (field) => {
  const key = String(field.key || "").replace(/([a-z])([A-Z])/g, "$1 $2");
  const name = String(field.name || "");
  return (
    field.dateFilter === true ||
    field.filterType === "date" ||
    /\b(date|time|timestamp)\b/i.test(`${key} ${name}`) ||
    /(?:created|updated|scraped|raised)At$/i.test(field.key || "")
  );
};
const isDateOnlyField = (field) =>
  /\bdate\b/i.test(
    `${String(field.key || "").replace(/([a-z])([A-Z])/g, "$1 $2")} ${field.name || ""}`,
  );
const MAX_SELECT = 1000;

// Columns that stay pinned on the left for the prospect grid.
// Compared after lowercasing and removing spaces/symbols.
const STICKY_NAME_KEYS = new Set(["employeename", "name"]);
const normKey = (k) =>
  String(k)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

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
const formatDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
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
function FilterPopup({ columnKey, anchor, onClose, isDate = false }) {
  const { filterModels, setFilterModel, fetchDistinct } = useContext(HeaderCtx);
  const model = filterModels[columnKey] ?? {};
  const op = model.op ?? (isDate ? "dateRange" : "contains");
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
  const setDateRange = (from, to) => {
    if (!from && !to && model.values == null) {
      setFilterModel(columnKey, null);
      return;
    }
    setFilterModel(columnKey, {
      op: "dateRange",
      text: "",
      values: model.values ?? null,
      from,
      to,
    });
  };

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
            {isDate ? "Date Filter" : "Text Filter"} <em>{opLabel}</em>
          </span>
          <span>{opOpen ? "⌄" : "›"}</span>
        </button>

        {opOpen && (
          <div className="agf-ops">
            {OPERATORS.filter((o) => !o.dateOnly || isDate).map((o) => (
              <button
                key={o.id}
                type="button"
                className={`agf-opt ${op === o.id ? "on" : ""}`}
                onClick={() => {
                  setFilterModel(
                    columnKey,
                    o.id === "dateRange"
                      ? { op: o.id, text: "", values: null }
                      : { op: o.id, from: "", to: "", values: null },
                  );
                  setOpOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {isDate && op === "dateRange" && (
          <div className="agf-search agf-date-range">
            <label>
              From
              <input
                type="date"
                value={model.from ?? ""}
                max={model.to || undefined}
                onChange={(event) =>
                  setDateRange(event.target.value, model.to ?? "")
                }
                aria-label={`From date for ${columnKey}`}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={model.to ?? ""}
                min={model.from || undefined}
                onChange={(event) =>
                  setDateRange(model.from ?? "", event.target.value)
                }
                aria-label={`To date for ${columnKey}`}
              />
            </label>
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
              <span>{labelOf(v, isDate)}</span>
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
  const isDate = Boolean(column.dateFilter);
  const op = model.op ?? (isDate ? "dateRange" : "contains");
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
          isDate={isDate}
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

const toHref = (v) => (/^https?:/i.test(v) ? v : `https://${v}`);

const renderFor = (key, field = {}) => {
  const dateField = {
    key,
    name: field.name,
    dateFilter: field.dateFilter,
    filterType: field.filterType,
  };
  const dateFilter = isDateField(dateField);
  const dateOnly = isDateOnlyField(dateField);
  const dateTimestamp = [
    "updatedAt",
    "createdAt",
    "scrapedAt",
    "lastRaisedAt",
  ].includes(key);
  if (key === "date" || dateOnly || (dateFilter && !dateTimestamp)) {
    return ({ row }) => {
      if (!row[key]) return null;
      const date = new Date(row[key]);
      return Number.isNaN(date.getTime())
        ? row[key]
        : date.toLocaleDateString("en-IN", { timeZone: "UTC" });
    };
  }
  if (dateTimestamp) {
    return ({ row }) => (row[key] ? new Date(row[key]).toLocaleString() : null);
  }
  // Logo / photo columns show the image itself instead of the URL text.
  if (/logo$/i.test(key)) {
    return ({ row }) =>
      row[key] ? <a href={`${row[key]}`}>{row[key]}</a> : null;

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
  if (/^(domain|companyDomain)$/i.test(key)) {
    return ({ row }) =>
      row[key] ? (
        <a href={toHref(row[key])} target="_blank" rel="noreferrer">
          {row[key]}
        </a>
      ) : null;
  }
  // "linkedinFollowers" etc. are numbers, not links.
  if (/link|website|linkedin/i.test(key) && !/followers|size|status/i.test(key)) {
    return ({ row }) => {
      const value = row[key];
      if (!value) return null;
      return (
        <a href={toHref(value)} target="_blank" rel="noreferrer">
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

const SOCIAL_ICONS = {
  linkedinUrl: {
    label: "LinkedIn",
    svg: (
      <>
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </>
    ),
  },
  facebookUrl: {
    label: "Facebook",
    svg: (
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    ),
  },
  instagramUrl: {
    label: "Instagram",
    svg: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </>
    ),
  },
  twitterUrl: {
    label: "Twitter",
    svg: (
      <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
    ),
  },
  youtubeUrl: {
    label: "YouTube",
    svg: (
      <>
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
      </>
    ),
  },
  tiktokUrl: {
    label: "TikTok",
    svg: (
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    ),
  },
  website: {
    label: "Website",
    svg: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </>
    ),
  },
};

/* Social icons: only the ones that have a value are drawn, each links to its URL. */
function SocialLinks({ row, keys, label }) {
  const parsedLinks = {};
  const socialKeys = {
    linkedin: "linkedinUrl",
    facebook: "facebookUrl",
    instagram: "instagramUrl",
    twitter: "twitterUrl",
    x: "twitterUrl",
    youtube: "youtubeUrl",
    tiktok: "tiktokUrl",
    website: "website",
  };
  for (const entry of String(row.companySocials || "").split(/\s*[|;\n]\s*/)) {
    const match = /^\s*([^:]+):\s*(https?:\/\/\S+)/i.exec(entry);
    if (!match) continue;
    const key = socialKeys[match[1].trim().toLowerCase()];
    if (key && (isBlankValue(row[key]) || row[key] === "—")) {
      parsedLinks[key] = match[2].replace(/[),.;]+$/, "");
    }
  }
  const urlFor = (key) =>
    isBlankValue(row[key]) || row[key] === "—" ? parsedLinks[key] : row[key];
  const links = (keys ?? []).filter(
    (key) => SOCIAL_ICONS[key] && !isBlankValue(urlFor(key)) && urlFor(key) !== "—",
  );
  if (!links.length) return null;
  return (
    <div className="dgp-social">
      {label && <span className="dgp-social-label">{label}</span>}
      {links.map((k) => {
        const icon = SOCIAL_ICONS[k];
        const href = urlFor(k);
        return (
         
          <a
            key={k}
            href={toHref(String(href).trim())}
            target="_blank"
            rel="noreferrer"
            title={icon.label}
            aria-label={icon.label}
            className={`dgp-social-link dgp-social-${k}`}
            onClick={(e) => e.stopPropagation()}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {icon.svg}
            </svg>
          </a>
        );
      })}
    </div>
  );
}

/* Round photo (people) or square logo (companies); falls back to initials. */
function CardAvatar({ url, text, square }) {
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
          borderRadius: square ? 8 : "50%",
          objectFit: square ? "contain" : "cover",
        }}
      />
    );
  }
  return initialsOf(text);
}

/* A card item is either a field key or { key, label, alt: [fallback keys] }. */
const itemKey = (item) => (typeof item === "string" ? item : item.key);
const itemAlt = (item) =>
  typeof item === "object" && Array.isArray(item.alt) ? item.alt : [];
const resolveKey = (row, item) =>
  [itemKey(item), ...itemAlt(item)].find((k) => !isBlankValue(row[k])) ??
  itemKey(item);

function RecordCard({
  row,
  cfg,
  fieldMap,
  selected,
  selectable,
  onToggle,
  onMore,
  onDelete,
}) {
  const title = cfg.title(row);
  const subtitle = cfg.subtitle?.(row);
  const badge = cfg.badgeKey ? row[cfg.badgeKey] : null;
  const isLogo = cfg.imageShape === "square";

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
        <div
          className={`dgp-ci-avatar ${isLogo ? "dgp-ci-avatar--logo" : ""}`}
          aria-hidden="true"
        >
          <CardAvatar
            url={row[cfg.imageKey ?? "profilePhotoUrl"]}
            text={title}
            square={isLogo}
          />
        </div>
        <div className="dgp-ci-id">
          <h3 title={title}>{title}</h3>
         
           
        </div>
        {badge && (
          <span className={`dgp-pill dgp-pill-${pillColor(badge)}`}>
            {badge}
          </span>
        )}
       
      </header>


      <dl className="dgp-ci-body">
        {cfg.items.map((item) => {
          const baseKey = itemKey(item);
          const f = fieldMap.get(baseKey);
          if (!f) return null;

          const key = resolveKey(row, item);
          const label =
            typeof item === "object" && item.label ? item.label : f.name;
          const render = renderFor(key, f);
          const value = row[key];

          return (
            <>
            <div key={baseKey} className="dgp-ci-row">
              <dt>{label}</dt>
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
             
            </>
          );
        })}
        
            <SocialLinks
              row={row}
              keys={cfg.socialKeys}
              label={cfg.socialLabel}
            />

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
        <div style={{ display: "flex", gap: 8 }}>
          {onDelete && row.status === "DisQualified" && (
            <button
              type="button"
              className="dgp-btn dgp-btn-sm"
              style={{ color: "#dc2626" }}
              onClick={onDelete}
            >
              Delete
            </button>
          )}
          <button type="button" className="dgp-btn dgp-btn-sm" onClick={onMore}>
            View more
          </button>
        </div>
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
  const isLogo = cfg.imageShape === "square";

  // modalShowAll = true -> list every field (companies); otherwise only the
  // fields that are not already shown on the card.
  const onCard = new Set(
    cfg.items.flatMap((i) => [itemKey(i), ...itemAlt(i)]),
  );
  const rest = cfg.modalShowAll
    ? fields
    : fields.filter((f) => !onCard.has(f.key));
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
          <div
            className={`dgp-ci-avatar lg ${isLogo ? "dgp-ci-avatar--logo" : ""}`}
            aria-hidden="true"
          >
            <CardAvatar
              url={row[cfg.imageKey ?? "profilePhotoUrl"]}
              text={title}
              square={isLogo}
            />
          </div>
          <div className="dgp-ci-id">
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
            <SocialLinks row={row} keys={cfg.socialKeys} />
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
            const render = renderFor(f.key, f);
            const value = row[f.key];
            return (
              <div key={f.key} className="dgp-md-row">
                <dt>{f.name}</dt>
                <dd>
                  {isBlankValue(value) ? (
                    <span className="dgp-ci-empty">—</span>
                  ) : render ? (
                    render({ row })
                  ) : Array.isArray(value) ? (
                    value.join(", ")
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
  externalData,
  headerActions,
  headerSubtitle,
}) {
  const dispatch = useDispatch();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useSelector((state) => state.auth);
  const dataState = useSelector((state) => state.data);
  const isDark = useIsDark();
  const externalMode = Boolean(externalData);
  const externalRows = externalData?.rows;
  const externalPagination = externalData?.pagination;
  const externalLoading = externalData?.loading;
  const externalError = externalData?.error;
  const externalQuery = externalData?.onQueryChange;
  const externalDistinct = externalData?.getDistinct;
  const externalExport = externalData?.onExport;
  const externalKey = externalData?.key;
  const rows = externalMode ? externalRows ?? [] : dataState[resource] ?? [];
  const pagination = externalMode
    ? externalPagination ?? {
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }
    : dataState.pagination?.[resource] ?? {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };
  const loading = externalMode ? Boolean(externalLoading) : dataState.loading;
  const error = externalMode ? externalError : dataState.error;
  const canEdit = !externalMode && can(user, resource, "edit");

  // cardConfig.defaultView = "card" opens the page in card view (used by Companies).
  const startInCards = cardConfig?.defaultView === "card";

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(startInCards ? 12 : 25);
  const [sortColumns, setSortColumns] = useState(() =>
    externalMode
      ? []
      : defaultSort.length
        ? defaultSort
        : [{ columnKey: "updatedAt", direction: "DESC" }],
  );
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
  const sortBy = sortColumns[0]?.columnKey ?? "";

  const sortOrder = sortColumns[0]?.direction === "DESC" ? "desc" : "asc";

  const [exportStatus, setExportStatus] = useState("");
  const [companyList, setCompanyList] = useState(null); // { listId, domainCount, nameCount, fileName }
  const [listError, setListError] = useState("");
  const [showListModal, setShowListModal] = useState(false);
  const [view, setView] = useState(startInCards ? "card" : "table"); // "table" | "card"
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
  const [jobStartedAt, setJobStartedAt] = useState(null);
  const [jobEndedAt, setJobEndedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  // Timing stats for the LinkedIn job panel
  const elapsedMs = jobStartedAt ? (jobEndedAt ?? now) - jobStartedAt : 0;
  const doneCount = linkedinJob?.results?.length ?? 0;
  const avgMs = doneCount ? elapsedMs / doneCount : 0;
  const remainingCount = Math.max(0, (linkedinJob?.total ?? 0) - doneCount);
  const etaMs =
    linkedinJob?.state === "running" && doneCount
      ? avgMs * remainingCount
      : null;
  // The Action column calls this ref so the columns memo does not rebuild
  // every time the delete handler changes.
  const deleteRowRef = useRef(() => {});
  const showActions = !externalMode && resource === "prospect" && canEdit;

  const [colQuery, setColQuery] = useState("");
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [highlightKey, setHighlightKey] = useState(null);
  const [pendingScroll, setPendingScroll] = useState(null);
  const gridWrapRef = useRef(null);
  const [colActive, setColActive] = useState(0);
  const colFindRef = useRef(null);

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      ...(!externalMode && companyList
        ? { companyListId: { op: "equals", text: companyList.listId } }
        : {}),
      ...fixedFilters,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, fixedKey, companyList, externalMode],
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

  // Re-render once a second while a job is running
  useEffect(() => {
    if (!jobStartedAt || jobEndedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [jobStartedAt, jobEndedAt]);

  // Debounced column filters -> server filter model
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = {};
      for (const [key, m] of Object.entries(filterModels)) {
        const op = m.op ?? (isDateField(fieldMap.get(key) || {}) ? "dateRange" : "contains");
        const text = needsText(op) ? (m.text ?? "").trim() : "";
        const hasText = needsText(op) ? Boolean(text) : true;
        const hasValues = m.values != null;
        const hasDateRange = Boolean(m.from || m.to);
        if (
          op === "dateRange"
            ? !hasDateRange && !hasValues
            : !hasText && !hasValues
        ) {
          continue;
        }
        next[key] =
          op === "dateRange"
            ? {
                op,
                from: m.from || "",
                to: m.to || "",
                values: m.values ?? null,
              }
            : { op, text, values: m.values ?? null };
      }
      setFilters((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [filterModels, fieldMap]);

  useEffect(() => {
    if (externalMode) {
      externalQuery?.({
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        filters: effectiveFilters,
      });
      return;
    }

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
    externalMode,
    externalQuery,
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
      if (externalMode) {
        return externalDistinct?.(key, valueSearch, {
          search: searchRef.current,
          filters: others,
        }) ?? Promise.resolve({ values: [], hasMore: false });
      }
      return getDistinctApi(resource, key, {
        search: searchRef.current,
        filters: others,
        valueSearch,
      });
    },
    [externalMode, externalDistinct, resource],
  );
  const STATUS_KEY = "status";
  const hasStatusField = fieldMap.has(STATUS_KEY);
  const statusLocked = Boolean(fixedFilters[STATUS_KEY]); // e.g. ?status=Qualified in the URL
  const [statusOptions, setStatusOptions] = useState([]);

  useEffect(() => {
    if (externalMode) return;
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
  }, [externalMode, view, hasStatusField, statusLocked, fetchDistinct]);

  useEffect(() => {
    if (!externalMode) return;
    const keys = fields.map((field) => field.key);
    setVisibleKeys(keys);
    setColumnOrder(keys);
    setPage(1);
    setSearchInput("");
    setSearch("");
    setFilterModels({});
    setFilters({});
    setSortColumns([]);
  }, [externalMode, externalKey, fields]);

  const activeStatus =
    filterModels[STATUS_KEY]?.op === "equals"
      ? (filterModels[STATUS_KEY].text ?? "")
      : "";

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

  const pickStatus = (value) =>
    headerCtx.setFilterModel(
      STATUS_KEY,
      value ? { op: "equals", text: value, values: null } : null,
    );

  const columns = useMemo(() => {
    const offset = (pagination.page - 1) * pagination.limit;

    // First column: Action (delete). Only DisQualified rows get a delete button.
    const actionCol = {
      key: "__actions",
      name: "Action",
      width: 80,
      minWidth: 80,
      maxWidth: 80,
      frozen: true,
      resizable: false,
      sortable: false,
      cellClass: "dgp-center-cell",
      headerCellClass: "dgp-center-cell",
      renderHeaderCell: () => <div className="agh agh-index">Action</div>,
      renderCell: ({ row }) =>
        row.status === "DisQualified" ? (
          <button
            type="button"
            title="Delete (moves to disqualified list)"
            aria-label="Delete prospect"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md
              text-red-600 transition hover:bg-red-50 hover:text-red-700
              focus:outline-none focus:ring-2 focus:ring-red-400
              dark:hover:bg-red-900/30"
            onClick={(e) => {
              e.stopPropagation();
              deleteRowRef.current(row);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        ) : (
          <span
            className="dgp-muted"
            title="Only DisQualified prospects can be deleted"
          >
            —
          </span>
        ),
    };

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
      renderCell: ({ row, rowIdx }) => (
        <span className="text-muted">
          {row.rowNumber ?? offset + rowIdx + 1}
        </span>
      ),
    };

    const dataCols = orderedFields
      .filter((field) => visibleKeys.includes(field.key))
      .map((field) => {
      const dateFilter = isDateField(field);
        const sticky =
          resource === "prospect" && STICKY_NAME_KEYS.has(normKey(field.key));
        return {
          key: field.key,
          name: field.name,
          dateFilter,
          minWidth: 180,
          width: sticky ? 200 : 220,
          frozen: sticky,
          resizable: true,
          sortable: false,
          cellClass: field.key === highlightKey ? "dgp-col-hl" : undefined,
          headerCellClass:
            field.key === highlightKey ? "dgp-col-hl-head" : undefined,
          renderHeaderCell: (props) => <HeaderCell {...props} />,
          renderCell: renderFor(field.key, {
            ...field,
            dateFilter,
            dateOnly: isDateOnlyField(field),
          }),
          renderEditCell: canEdit ? textEditor : undefined,
        };
      });

    // frozen columns must come first in the array
    const stickyCols = dataCols.filter((c) => c.frozen);
    const otherCols = dataCols.filter((c) => !c.frozen);

    return [
      ...(showActions ? [actionCol] : []),
      ...(!externalMode ? [selectCol] : []),
      rowNumber,
      ...stickyCols,
      ...otherCols,
    ];
  }, [
    orderedFields,
    visibleKeys,
    canEdit,
    showActions,
    externalMode,
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
      toast.warning(
        `You can select a maximum of ${MAX_SELECT} records at a time.`,
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

  const selectableCards = !externalMode && resource === "prospect" && canEdit;
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

  // Clear ticked rows whenever the result set changes.
  useEffect(() => {
    clearSelection();
  }, [resource, search, effectiveFilters, clearSelection]);

  const reloadCurrentPage = () =>
    externalMode
      ? externalQuery?.({
          page,
          limit,
          search,
          sortBy,
          sortOrder,
          filters: effectiveFilters,
        })
      : dispatch(
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

  /* ---- Delete one DisQualified prospect (archived to the disqualified list on the server) ---- */
  const handleDeleteRow = async (row) => {
    if (row.status !== "DisQualified") {
      toast.warning("Only DisQualified prospects can be deleted.");
      return;
    }

    const name = nameOfRecord(row);

    const ok = await confirm({
      title: "Delete prospect?",
      message: `"${name}" will be moved to the disqualified list and removed from prospects.`,
      confirmLabel: "Delete",
      busyLabel: "Deleting...",
      // Runs while the modal shows "Deleting...". If it throws, an error toast appears.
      onConfirm: () => dispatch(deleteDisqualified({ ids: [row._id] })).unwrap(),
    });

    if (!ok) return;

    selectedCache.current.delete(row._id);
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.delete(row._id);
      return next;
    });

    toast.success(`${name} moved to the disqualified list.`);
    reloadCurrentPage();
  };
  deleteRowRef.current = handleDeleteRow;

  const downloadJobLog = async () => {
    try {
      const blob = await exportLinkedinLogsApi({ jobId: linkedinJob.jobId });
      saveBlob(
        blob,
        `linkedin-update-log-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      console.error("Log download failed:", err);
      toast.error(
        err?.response?.data?.message || err.message || "Log download failed.",
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
        setLinkedinStatus(
          `Updating... ${s.processed ?? 0}/${s.total ?? total}`,
        );

        if (results.length > seen) {
          seen = results.length;
          reloadRef.current();
        }

        if (s.state === "failed") {
          setJobEndedAt((e) => e ?? Date.now());
          clearJobMeta();
          throw new Error(s.error || "LinkedIn update failed");
        }
        if (s.state === "done" || s.state === "stopped") {
          setJobEndedAt((e) => e ?? Date.now());
          clearJobMeta();
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
        toast.warning(
          `${last.error || "LinkedIn update stopped early."} (${updated} updated, ${notUpdated} skipped or failed)`,
          9000,
        );
      } else if (results.length && notUpdated === results.length) {
        toast.warning(
          `No profiles were updated. ${notUpdated} record(s) were skipped or failed.`,
          7000,
        );
      } else if (results.length && notUpdated > 0) {
        toast.info(
          `LinkedIn update finished: ${updated} updated, ${notUpdated} skipped or failed.`,
          7000,
        );
      } else {
        toast.success(`LinkedIn profiles updated for ${total} record(s).`);
      }
    } catch (err) {
      if (!isCurrent()) return;
      if (err?.response?.status === 404) clearJobMeta(); // server no longer knows this job
      setLinkedinJob((j) =>
        j ? { ...j, state: "failed", error: err.message } : j,
      );
      reloadRef.current();
      toast.error(
        err?.response?.data?.message ||
          err.message ||
          "Could not update LinkedIn profiles.",
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

    const queue = records.map((r) => ({
      id: String(r._id),
      name: nameOfRecord(r),
    }));

    setLinkedinQueue(queue);
    const startedAt = Date.now();
    setJobStartedAt(startedAt);
    setJobEndedAt(null);
    setNow(startedAt);
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

      saveJobMeta({ jobId, total: records.length, queue, startedAt }); // survives refresh
      setLinkedinJob((j) => (j ? { ...j, jobId } : j));
      clearSelection();

      await runLinkedinJob(jobId, records.length);
    } catch (err) {
      setLinkedinBusy(false);
      setLinkedinStatus("");
      setLinkedinJob((j) =>
        j ? { ...j, state: "failed", error: err.message } : j,
      );
      setJobEndedAt((e) => e ?? Date.now());
      toast.error(
        err?.response?.data?.message ||
          err.message ||
          "Could not start the LinkedIn update.",
        7000,
      );
    }
  };

  // After a page refresh, pick the running job back up.
  useEffect(() => {
    if (externalMode) return;
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
    setJobStartedAt(meta.startedAt ?? Date.now());
    setJobEndedAt(null);
    setNow(Date.now());

    return () => {
      pollRunRef.current++; // stop the loop when leaving the page
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, externalMode]);

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

      if (externalMode) {
        const blob = await externalExport({
          search,
          sortBy,
          sortOrder,
          filters: effectiveFilters,
          columns: exportColumns,
        });
        saveBlob(
          blob,
          `${resource}-raw-${new Date().toISOString().slice(0, 10)}.xlsx`,
        );
        toast.success("Export downloaded.");
        return;
      }

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
      toast.success("Export downloaded.");
    } catch {
      toast.error("Export failed. Please try again.", 6000);
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

  const toggleColumn = (key) =>
    setVisibleKeys((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );
  useEffect(() => {
    setPage(1);
  }, [companyList]);

  // Clears only the user's own filters; the locked URL filters stay.
  const clearAll = () => {
    setFilterModels({});
    setSearchInput("");
    setSortColumns([]);
  };

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
      <div className="dgp-card dgp-head">
        <div>
          <h2 className="dgp-title">{title}</h2>
          {headerSubtitle && (
            <p className="dgp-muted">{headerSubtitle}</p>
          )}
          <span className="dgp-badge">
            {pagination.total.toLocaleString()} total records
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {headerActions}

          {!externalMode && resource === "prospect" && canEdit && (
            <button
              type="button"
              className="dgp-btn dgp-btn-primary"
              onClick={() => setShowImport(true)}
            >
              Import Excel
            </button>
          )}

          {!externalMode && resource === "company" && canEdit && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Import Excel
            </button>
          )}

          {!externalMode &&
            (resource === "prospect" || resource === "company") && (
            <button
              type="button"
              className="dgp-btn"
              onClick={() => setShowListModal(true)}
            >
              Filter by company list
            </button>
          )}

          {!externalMode &&
            resource === "prospect" &&
            canEdit &&
            selectedRows.size > 0 && (
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
          {!externalMode && selectedRows.size > 0 && (
            <button
              type="button"
              className="dgp-btn"
              onClick={() => setSelectedRows(new Set())}
            >
              Clear selection
            </button>
          )}
        </div>

        {!externalMode && (
          <CompanyListModal
            open={showListModal}
            onClose={() => setShowListModal(false)}
            onApplied={setCompanyList}
          />
        )}

        {!externalMode && showImport && (
          <ImportExcelModal
            onClose={() => setShowImport(false)}
            onImported={onImported}
          />
        )}
      </div>

      {!externalMode && linkedinJob && (
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
            {jobStartedAt && (
              <div
                className="dgp-muted"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  marginBottom: 8,
                }}
              >
                <span>
                  {jobEndedAt ? "Total time" : "Elapsed"}:{" "}
                  <strong>{formatDuration(elapsedMs)}</strong>
                </span>
                {doneCount > 0 && (
                  <span>
                    Avg per profile: <strong>{formatDuration(avgMs)}</strong>
                  </span>
                )}
                {etaMs != null && (
                  <span>
                    Est. remaining: <strong>~{formatDuration(etaMs)}</strong>
                  </span>
                )}
              </div>
            )}
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
                background: "#0f9f92",
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
                  <th className="p-2">Changes</th>
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
                      <td className="p-2 min-w-[320px] text-gray-600 dark:text-gray-300">
                        {res ? (
                          res.diff ? (
                            <ChangeDiff
                              changes={res.diff}
                              reason={res.reason}
                            />
                          ) : typeof res.detail === "string" ? (
                            res.detail
                          ) : (
                            res.summary || ""
                          )
                        ) : (
                          ""
                        )}
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

            {(!externalMode || externalExport) && (
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
            )}

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
                      onDelete={
                        showActions ? () => handleDeleteRow(row) : undefined
                      }
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
              {externalData?.emptyMessage ??
                "No records match your search or filters."}
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
                  ),
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