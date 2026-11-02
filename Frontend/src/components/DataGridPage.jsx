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
} from "../services/dataService";
import "./DataGridPage.css";
import ImportExcelModal from "./ImportExcelModal";
import CompanyImportModal from "./CompanyImportModal";
import CompanyListModal from "./CompanyListModal";

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
const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, "");

/* ---------- Toaster (no extra package needed) ---------- */

const TOAST_COLORS = {
  success: "#16a34a",
  error: "#dc2626",
  warning: "#d97706",
  info: "#2563eb",
};

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

/* ---------- Page ---------- */

const NO_FIXED_FILTERS = {};

export default function DataGridPage({
  resource,
  title,
  fields,
  fixedFilters = NO_FIXED_FILTERS,
}) {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const dataState = useSelector((state) => state.data);

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
  const [sortColumns, setSortColumns] = useState([]);
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

  const [selectedRows, setSelectedRows] = useState(() => new Set()); // set of row _id

  const selectedCache = useRef(new Map()); // _id -> full row object
  const [linkedinBusy, setLinkedinBusy] = useState(false);
  // Column filters typed by the user + locked filters from the URL (locked ones win).
  const fixedKey = JSON.stringify(fixedFilters);
  const [linkedinStatus, setLinkedinStatus] = useState("");
  const [linkedinJob, setLinkedinJob] = useState(null);
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

    return [selectCol, rowNumber, ...stickyCols, ...otherCols ];
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
    grid.scrollTo({ left: Math.max(0, left - frozenWidth - 8), behavior: "smooth" });
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

const updateLinkedinProfiles = async () => {
  const records = getSelectedRecords();
  if (!records.length) return;

  setLinkedinBusy(true);
  setLinkedinStatus("Starting...");
  setLinkedinJob({
    state: "running",
    total: records.length,
    processed: 0,
    current: "",
    results: [],
    error: null,
  });

  try {
    const started = await updateLinkedinProfilesApi(resource, records);
    const jobId = started.jobId ?? started.job_id;
    if (!jobId) throw new Error("No job id returned.");

    clearSelection();

    let last = null;
    let seen = 0;
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      const s = await getLinkedinUpdateStatusApi(jobId);
      const results = Array.isArray(s.results) ? s.results : [];

      setLinkedinJob({ ...s, results });
      setLinkedinStatus(`Updating... ${s.processed ?? 0}/${s.total ?? records.length}`);

      // A new profile finished: reload the grid now, don't wait for the rest.
      if (results.length > seen) {
        seen = results.length;
        reloadCurrentPage();
      }

      if (s.state === "failed") throw new Error(s.error || "LinkedIn update failed");
      if (s.state === "done" || s.state === "stopped") {
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
      showToast(`No profiles were updated. ${notUpdated} record(s) were skipped or failed.`, "warning", 7000);
    } else if (results.length && notUpdated > 0) {
      showToast(`LinkedIn update finished: ${updated} updated, ${notUpdated} skipped or failed.`, "info", 7000);
    } else {
      showToast(`LinkedIn profiles updated for ${records.length} record(s).`, "success");
    }
  } catch (err) {
    setLinkedinJob((j) => (j ? { ...j, state: "failed", error: err.message } : j));
    reloadCurrentPage();
    showToast(
      err?.response?.data?.message || err.message || "Could not update LinkedIn profiles.",
      "error",
      7000,
    );
  } finally {
    setLinkedinBusy(false);
    setLinkedinStatus("");
  }
};

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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <strong>
        LinkedIn update: {linkedinJob.processed ?? 0}/{linkedinJob.total}
        {linkedinJob.state === "done" && " ✓ finished"}
        {linkedinJob.state === "stopped" && " (stopped)"}
        {linkedinJob.state === "failed" && " (failed)"}
      </strong>
      {!linkedinBusy && (
        <button type="button" className="dgp-btn dgp-btn-sm" onClick={() => setLinkedinJob(null)}>
          Close
        </button>
      )}
    </div>

    <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
      <div
        style={{
          width: `${linkedinJob.total ? ((linkedinJob.processed ?? 0) / linkedinJob.total) * 100 : 0}%`,
          height: "100%",
          background: "#4f46e5",
          transition: "width .3s",
        }}
      />
    </div>

    {linkedinJob.error && <div className="dgp-alert">{linkedinJob.error}</div>}

    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
          <th style={{ padding: 6 }}>#</th>
          <th style={{ padding: 6 }}>Prospect</th>
          <th style={{ padding: 6 }}>Result</th>
          <th style={{ padding: 6 }}>Details</th>
        </tr>
      </thead>
      <tbody>
        {linkedinJob.results.map((r, i) => (
          <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
            <td style={{ padding: 6 }}>{i + 1}</td>
            <td style={{ padding: 6 }}>{r.name}</td>
            <td style={{ padding: 6 }}>
              <span
                className={`dgp-pill dgp-pill-${
                  r.status === "failed" ? "danger"
                  : r.status === "skipped" ? "warning"
                  : r.status === "disqualified" ? "danger"
                  : "success"
                }`}
              >
                {r.status}
              </span>
            </td>
            <td style={{ padding: 6 }}>
              {r.summary || (typeof r.detail === "string" ? r.detail : "")}
            </td>
          </tr>
        ))}
        {linkedinJob.state === "running" && linkedinJob.current && (
          <tr>
            <td style={{ padding: 6 }}>{linkedinJob.results.length + 1}</td>
            <td style={{ padding: 6 }}>{linkedinJob.current}</td>
            <td style={{ padding: 6 }} colSpan={2}>Updating...</td>
          </tr>
        )}
      </tbody>
    </table>
    {linkedinJob.state === "running" &&
      linkedinJob.total - linkedinJob.results.length - (linkedinJob.current ? 1 : 0) > 0 && (
        <div className="dgp-muted" style={{ marginTop: 8 }}>
          {linkedinJob.total - linkedinJob.results.length - (linkedinJob.current ? 1 : 0)} waiting
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
            if (el && i === colActive) el.scrollIntoView({ block: "nearest" });
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

            <label className="dgp-rows">
              Rows
              <select
                className="dgp-select"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && <div className="dgp-alert">{String(error)}</div>}

       <div ref={gridWrapRef} className={`dgp-grid ${loading ? "is-loading" : ""}`}>
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

            <DataGrid
              className="rdg-light ag-like"
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
          <span className="dgp-muted">
            Showing {startRecord.toLocaleString()}–{endRecord.toLocaleString()}{" "}
            of {pagination.total.toLocaleString()}
          </span>

          <div className="dgp-pager">
            <button
              type="button"
              className="dgp-btn dgp-btn-sm"
              disabled={!pagination.hasPrevPage || loading}
              onClick={() => setPage(1)}
            >
              «
            </button>
            <button
              type="button"
              className="dgp-btn dgp-btn-sm"
              disabled={!pagination.hasPrevPage || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="dgp-page">
              Page {pagination.page} of {totalPages}
            </span>
            <button
              type="button"
              className="dgp-btn dgp-btn-sm"
              disabled={!pagination.hasNextPage || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
            <button
              type="button"
              className="dgp-btn dgp-btn-sm"
              disabled={!pagination.hasNextPage || loading}
              onClick={() => setPage(totalPages)}
            >
              »
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}