import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import DataGrid, { textEditor } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchRows,
  addRow,
  updateRow,
  deleteRow,
  patchLocal,
} from '../features/dataSlice';
import { can } from '../features/authSlice';
import { getDistinctApi, exportRowsApi } from '../services/dataService';
import './DataGridPage.css';

/* ---------- Filter model helpers ---------- */

const OPERATORS = [
  { id: 'contains', label: 'Contains', text: true },
  { id: 'notContains', label: 'Does not contain', text: true },
  { id: 'equals', label: 'Equals', text: true },
  { id: 'notEqual', label: 'Does not equal', text: true },
  { id: 'startsWith', label: 'Begins with', text: true },
  { id: 'endsWith', label: 'Ends with', text: true },
  { id: 'blank', label: 'Blank', text: false },
  { id: 'notBlank', label: 'Not blank', text: false },
];

const needsText = (op) => OPERATORS.find((o) => o.id === op)?.text ?? true;
const isBlankValue = (v) => v === null || v === undefined || v === '';
const sameValue = (a, b) => (isBlankValue(a) && isBlankValue(b)) || a === b;
const labelOf = (v) => (isBlankValue(v) ? '(Blanks)' : String(v));
const isAdvanced = (m) => Boolean(m) && (m.values != null || (m.op && m.op !== 'contains'));

/* ---------- Header (AG Grid style: title + sort icon + menu, then filter box) ---------- */

const HeaderCtx = createContext(null);
const COLUMN_DRAG_TYPE = 'text/x-dgp-column';

const stopKeys = (e) => {
  if (e.key !== 'Tab') e.stopPropagation();
};

function SortIcon({ direction }) {
  return (
    <span className="agh-sort" aria-hidden="true">
      <span className={`agh-up ${direction === 'ASC' ? 'on' : ''}`} />
      <span className={`agh-down ${direction === 'DESC' ? 'on' : ''}`} />
    </span>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* Popup: operator list + searchable checklist of the column's values (server-backed) */
function FilterPopup({ columnKey, anchor, onClose }) {
  const { filterModels, setFilterModel, fetchDistinct } = useContext(HeaderCtx);
  const model = filterModels[columnKey] ?? {};
  const op = model.op ?? 'contains';
  const values = model.values ?? null;

  const [opOpen, setOpOpen] = useState(false);
  const [q, setQ] = useState('');
  const [list, setList] = useState({ items: [], hasMore: false, loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    setList((current) => ({ ...current, loading: true, error: '' }));

    const timer = setTimeout(async () => {
      try {
        const res = await fetchDistinct(columnKey, q);
        if (!cancelled) {
          setList({ items: res?.values ?? [], hasMore: Boolean(res?.hasMore), loading: false, error: '' });
        }
      } catch {
        if (!cancelled) {
          setList({ items: [], hasMore: false, loading: false, error: 'Could not load values.' });
        }
      }
    }, q ? 300 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [columnKey, q, fetchDistinct]);

  const { items, hasMore } = list;
  const complete = !hasMore && !q; // the list is every value in the column

  // No values filter + complete list = everything is ticked.
  const isChecked = (v) => (values ? values.some((x) => sameValue(x, v)) : !hasMore);
  const allChecked = items.length > 0 && items.every(isChecked);

  const commit = (next) => {
    const normalized = complete && next && next.length === items.length ? null : next;
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

  const opLabel = OPERATORS.find((o) => o.id === op)?.label ?? 'Contains';

  return createPortal(
    <>
      <div className="agm-backdrop" onClick={onClose} />
      <div
        className="agf"
        style={{ top: anchor.top, left: anchor.left }}
        onKeyDown={stopKeys}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="agf-op" onClick={() => setOpOpen((o) => !o)}>
          <span>Text Filter <em>{opLabel}</em></span>
          <span>{opOpen ? '⌄' : '›'}</span>
        </button>

        {opOpen && (
          <div className="agf-ops">
            {OPERATORS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`agf-opt ${op === o.id ? 'on' : ''}`}
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
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              <span>{q ? '(Select all results)' : '(Select all)'}</span>
            </label>
          )}

          {items.map((v) => (
            <label key={isBlankValue(v) ? '__blank' : `${typeof v}:${v}`} className="agf-item">
              <input type="checkbox" checked={isChecked(v)} onChange={() => toggle(v)} />
              <span>{labelOf(v)}</span>
            </label>
          ))}

          {hasMore && (
            <div className="agf-note">Showing the first {items.length} values. Search to narrow the list.</div>
          )}
        </div>

        <div className="agf-foot">
          <button type="button" className="agf-clear" onClick={() => { setFilterModel(columnKey, null); setQ(''); }}>
            Clear filter
          </button>
          <button type="button" className="agf-done" onClick={onClose}>Done</button>
        </div>
      </div>
    </>,
    document.body
  );
}

function HeaderCell({ column }) {
  const { sortColumns, setSort, filterModels, setFilterModel, hideColumn, moveColumn } =
    useContext(HeaderCtx);
  const key = column.key;
  const model = filterModels[key] ?? {};
  const op = model.op ?? 'contains';
  const direction = sortColumns[0]?.columnKey === key ? sortColumns[0].direction : null;

  const [menu, setMenu] = useState(null);
  const [popup, setPopup] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const btnRef = useRef(null);
  const filterBtnRef = useRef(null);

  const cycleSort = () =>
    setSort(key, direction === null ? 'ASC' : direction === 'ASC' ? 'DESC' : null);

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
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(COLUMN_DRAG_TYPE, key);
    const cell = e.currentTarget.closest('.rdg-cell');
    if (cell) e.dataTransfer.setDragImage(cell, 24, 20);
  };
  const isColumnDrag = (e) => Array.from(e.dataTransfer.types).includes(COLUMN_DRAG_TYPE);
  const onDragOver = (e) => {
    if (!isColumnDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
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
      className={`agh ${dragOver ? 'agh-drop' : ''}`}
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
        <button type="button" className="agh-title" onClick={cycleSort} title={column.name}>
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
          value={textEnabled ? model.text ?? '' : ''}
          disabled={!textEnabled}
          onChange={(e) => setFilterModel(key, { text: e.target.value })}
          onKeyDown={stopKeys}
          onClick={(e) => e.stopPropagation()}
          placeholder={textEnabled ? 'Filter...' : OPERATORS.find((o) => o.id === op)?.label}
          aria-label={`Filter ${column.name}`}
        />
        <button
          type="button"
          ref={filterBtnRef}
          className={`agh-filter-btn ${isAdvanced(model) ? 'on' : ''}`}
          aria-label={`${column.name} filter options`}
          onClick={openPopup}
        >
          <FilterIcon />
        </button>
      </div>

      {popup && <FilterPopup columnKey={key} anchor={popup} onClose={() => setPopup(null)} />}

      {menu &&
        createPortal(
          <>
            <div className="agm-backdrop" onClick={close} />
            <div className="agm-menu" style={{ top: menu.top, left: menu.left }}>
              <button type="button" className="agm-item" onClick={pick(() => setSort(key, 'ASC'))}>Sort ascending</button>
              <button type="button" className="agm-item" onClick={pick(() => setSort(key, 'DESC'))}>Sort descending</button>
              <button type="button" className="agm-item" disabled={!direction} onClick={pick(() => setSort(key, null))}>
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
              <button type="button" className="agm-item" onClick={pick(() => hideColumn(key))}>Hide column</button>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

/* ---------- Cell renderers ---------- */

const STATUS_COLORS = {
  approved: 'success',
  accepted: 'success',
  valid: 'success',
  rejected: 'danger',
  invalid: 'danger',
  pending: 'warning',
  review: 'warning',
};

const renderFor = (key) => {
  if (key === 'Status' || key === 'EBB Status') {
    return ({ row }) => {
      const value = row[key];
      if (!value) return null;
      const color = STATUS_COLORS[String(value).toLowerCase()] ?? 'secondary';
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
      return <a href={href} target="_blank" rel="noreferrer">{value}</a>;
    };
  }
  return undefined;
};

/* ---------- Page ---------- */

export default function DataGridPage({ resource, title, fields }) {
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
  const canEdit = can(user, resource, 'edit');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortColumns, setSortColumns] = useState([]);
  const [filterModels, setFilterModels] = useState({});
  const [filters, setFilters] = useState({});
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(() => fields.map((f) => f.key));
  const [columnOrder, setColumnOrder] = useState(() => fields.map((f) => f.key));

  const sortBy = sortColumns[0]?.columnKey ?? '';
  const sortOrder = sortColumns[0]?.direction === 'DESC' ? 'desc' : 'asc';

  // Debounced global search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounced column filters -> server filter model
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = {};
      for (const [key, m] of Object.entries(filterModels)) {
        const op = m.op ?? 'contains';
        const text = needsText(op) ? (m.text ?? '').trim() : '';
        const hasText = needsText(op) ? Boolean(text) : true;
        const hasValues = m.values != null;
        if (!hasText && !hasValues) continue;
        next[key] = { op, text, values: m.values ?? null };
      }
      setFilters((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [filterModels]);

  useEffect(() => {
    dispatch(
      fetchRows({ resource, page, limit, search, sortBy, sortOrder, filters })
    );
  }, [dispatch, resource, page, limit, search, sortBy, sortOrder, filters]);

  // Refs keep fetchDistinct stable so the open filter popup does not refetch on every keystroke.
  const searchRef = useRef('');
  const filtersRef = useRef({});
  searchRef.current = search;
  filtersRef.current = filters;

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
    [resource]
  );

  // Fields in the user's chosen order (new fields that appear later are appended).
  const orderedFields = useMemo(() => {
    const byKey = new Map(fields.map((f) => [f.key, f]));
    const ordered = columnOrder.filter((k) => byKey.has(k)).map((k) => byKey.get(k));
    const missing = fields.filter((f) => !columnOrder.includes(f.key));
    return [...ordered, ...missing];
  }, [fields, columnOrder]);

  // Move `sourceKey` into the position currently held by `targetKey`.
  const moveColumn = useCallback(
    (sourceKey, targetKey) =>
      setColumnOrder((current) => {
        const all = [...current, ...fields.map((f) => f.key).filter((k) => !current.includes(k))];
        const from = all.indexOf(sourceKey);
        const to = all.indexOf(targetKey);
        if (from < 0 || to < 0 || from === to) return current;
        const next = [...all];
        next.splice(from, 1);
        next.splice(to, 0, sourceKey);
        return next;
      }),
    [fields]
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
    [sortColumns, filterModels, fetchDistinct, moveColumn]
  );

  const columns = useMemo(() => {
    const offset = (pagination.page - 1) * pagination.limit;

    const rowNumber = {
      key: '__index',
      name: '#',
      width: 64,
      frozen: true,
      resizable: false,
      sortable: false,
      renderHeaderCell: () => <div className="agh agh-index" />,
      renderCell: ({ rowIdx }) => <span className="text-muted">{offset + rowIdx + 1}</span>,
    };

    const dataCols = orderedFields
      .filter((field) => visibleKeys.includes(field.key))
      .map((field) => ({
        key: field.key,
        name: field.name,
        minWidth: 150,
        width: 180,
        resizable: true,
        sortable: false, // handled by our custom header
        renderHeaderCell: (props) => <HeaderCell {...props} />,
        renderCell: renderFor(field.key),
        renderEditCell: canEdit ? textEditor : undefined,
      }));

    const result = [rowNumber, ...dataCols];
    return result;
  }, [orderedFields, visibleKeys, canEdit, dispatch, resource, pagination.page, pagination.limit]);

  const onRowsChange = (newRows, { indexes }) => {
    indexes.forEach((index) => {
      const row = newRows[index];
      const previous = rows[index];
      if (!row?._id || !previous) return;

      // Only send the fields that actually changed.
      const changes = Object.fromEntries(
        fields
          .filter((f) => row[f.key] !== previous[f.key])
          .map((f) => [f.key, row[f.key]])
      );
      if (!Object.keys(changes).length) return;

      dispatch(patchLocal({ resource, id: row._id, changes }));
      dispatch(updateRow({ resource, id: row._id, changes }));
    });
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      // Same search, sort and filters as the grid, and only the visible columns.
      const columns = orderedFields
        .filter((f) => visibleKeys.includes(f.key))
        .map((f) => ({ key: f.key, name: f.name }));

      const blob = await exportRowsApi(resource, {
        search,
        sortBy,
        sortOrder,
        filters,
        columns,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${resource}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const addBlank = () => {
    dispatch(addRow({ resource, row: Object.fromEntries(fields.map((f) => [f.key, ''])) }));
  };

  const toggleColumn = (key) =>
    setVisibleKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );

  const clearAll = () => {
    setFilterModels({});
    setSearchInput('');
    setSortColumns([]);
  };

  const activeCount =
    Object.keys(filters).length + (search ? 1 : 0) + (sortColumns.length ? 1 : 0);
  const startRecord = pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.total);
  const totalPages = Math.max(1, pagination.totalPages);

  return (
    <section className="dgp">
      <div className="dgp-card dgp-head">
        <div>
          <h2 className="dgp-title">{title}</h2>
          <span className="dgp-badge">{pagination.total.toLocaleString()} total records</span>
        </div>
       
      </div>

      <div className="dgp-card">
        <div className="dgp-toolbar">
          <div className="dgp-search">
            <span className="dgp-search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              className="dgp-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`Search all ${title.toLowerCase()}...`}
              aria-label={`Search ${title}`}
            />
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
              {exporting ? 'Exporting...' : `Export Excel (${pagination.total.toLocaleString()})`}
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
                  <div className="agm-backdrop" onClick={() => setShowColumnsMenu(false)} />
                  <div className="dgp-colmenu">
                    <div className="dgp-colmenu-head">
                      <strong>Show, hide &amp; reorder</strong>
                      <span>
                        <button
                          type="button"
                          className="dgp-link"
                          onClick={() => setVisibleKeys(fields.map((f) => f.key))}
                        >
                          Show all
                        </button>
                        {' · '}
                        <button
                          type="button"
                          className="dgp-link"
                          onClick={() => setColumnOrder(fields.map((f) => f.key))}
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
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && <div className="dgp-alert">{String(error)}</div>}

        <div className={`dgp-grid ${loading ? 'is-loading' : ''}`}>
          <HeaderCtx.Provider value={headerCtx}>
            <DataGrid
              className="rdg-light ag-like"
              columns={columns}
              rows={rows}
              rowKeyGetter={(row) => row._id}
              onRowsChange={onRowsChange}
              rowHeight={42}
              headerRowHeight={84}
              rowClass={(_, index) => (index % 2 ? 'ag-row-alt' : undefined)}
              defaultColumnOptions={{ resizable: true }}
            />
          </HeaderCtx.Provider>
          {!loading && rows.length === 0 && (
            <div className="dgp-empty">No records match your search or filters.</div>
          )}
        </div>

        <div className="dgp-foot">
          <span className="dgp-muted">
            Showing {startRecord.toLocaleString()}–{endRecord.toLocaleString()} of{' '}
            {pagination.total.toLocaleString()}
          </span>

          <div className="dgp-pager">
            <button type="button" className="dgp-btn dgp-btn-sm" disabled={!pagination.hasPrevPage || loading} onClick={() => setPage(1)}>«</button>
            <button type="button" className="dgp-btn dgp-btn-sm" disabled={!pagination.hasPrevPage || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
            <span className="dgp-page">Page {pagination.page} of {totalPages}</span>
            <button type="button" className="dgp-btn dgp-btn-sm" disabled={!pagination.hasNextPage || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
            <button type="button" className="dgp-btn dgp-btn-sm" disabled={!pagination.hasNextPage || loading} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      </div>
    </section>
  );
}