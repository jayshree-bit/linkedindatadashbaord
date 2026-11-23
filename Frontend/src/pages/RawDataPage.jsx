import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { can } from '../features/authSlice';
import DataGridPage from '../components/DataGridPage';
import { useConfirm, useToast } from '../components/Feedbackprovider';
import RawExcelImportModal from '../components/RawExcelImportModal';
import { prospectFields } from './Prospects/Prospects';
import {
  deleteRawDisqualifiedProspectsApi,
  exportRawRowsApi,
  getRawDistinctApi,
  getRawImportsApi,
  getRawRowsApi,
} from '../services/dataService';

const LINKEDIN_DISQUALIFIED_IMPORT_ID = '__linkedin_disqualified_prospects__';
const DISQUALIFIED_FILTERS = {
  status: { op: 'equals', text: 'DisQualified', values: null },
};

const isDateColumn = (column) => {
  const name = String(column || '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return (
    /\b(date|time|timestamp)\b/i.test(name) ||
    /(?:created|updated|scraped|raised)At$/i.test(String(column || ''))
  );
};

const formatCell = (value) => {
  if (value == null || value === '') return '—';
  if (typeof value === 'object') {
    if (value.hyperlink) return String(value.hyperlink);
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('');
    }
    if (value.text != null) return String(value.text);
    if (value.result != null) return String(value.result);
    try {
      return JSON.stringify(value);
    } catch {
      return '[value]';
    }
  }
  return String(value);
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const normalizeHeader = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const socialColumns = [
  {
    key: 'linkedinUrl',
    names: [
      'linkedin',
      'linkedinurl',
      'linkedinprofilelink',
      'companylinkedinurl',
      'linkedincompanyurl',
    ],
  },
  { key: 'facebookUrl', names: ['facebook', 'facebookurl'] },
  { key: 'instagramUrl', names: ['instagram', 'instagramurl'] },
  { key: 'twitterUrl', names: ['twitter', 'twitterurl', 'x', 'xurl'] },
  { key: 'youtubeUrl', names: ['youtube', 'youtubeurl'] },
  { key: 'tiktokUrl', names: ['tiktok', 'tiktokurl'] },
  { key: 'website', names: ['website', 'companywebsite'] },
];

const parseCompanySocials = (value) => {
  const keys = {
    linkedin: 'linkedinUrl',
    facebook: 'facebookUrl',
    instagram: 'instagramUrl',
    twitter: 'twitterUrl',
    x: 'twitterUrl',
    youtube: 'youtubeUrl',
    tiktok: 'tiktokUrl',
    website: 'website',
  };
  const links = {};
  for (const entry of String(value || '').split(/\s*[|;\n]\s*/)) {
    const match = /^\s*([^:]+):\s*(https?:\/\/\S+)/i.exec(entry);
    if (!match) continue;
    const key = keys[match[1].trim().toLowerCase()];
    if (key) links[key] = match[2].replace(/[),.;]+$/, '');
  }
  return links;
};

const getSocialValues = (row, columns) => {
  const values = {};
  for (const social of socialColumns) {
    const index = columns.findIndex((column) =>
      social.names.includes(normalizeHeader(column)),
    );
    if (index >= 0) {
      const value = row.rawData?.[index]?.value;
      values[social.key] = value == null || value === '' ? '' : formatCell(value);
    }
  }

  const combinedIndex = columns.findIndex((column) =>
    ['companysocials', 'sociallinks'].includes(normalizeHeader(column)),
  );
  if (combinedIndex >= 0) {
    Object.assign(
      values,
      parseCompanySocials(row.rawData?.[combinedIndex]?.value),
    );
  }
  return values;
};

function SearchableImportSelect({
  imports,
  selectedImport,
  onChange,
  disabled,
  loading,
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = imports.find((item) => item.importId === selectedImport);
  const optionLabel = (item) =>
    `${item.fileName} · ${item.totalRows.toLocaleString()} rows · ${formatDate(item.importedAt)}`;
  const filteredImports = useMemo(
    () =>
      imports.filter((item) =>
        optionLabel(item).toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [imports, query],
  );

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-72 max-w-full">
      <input
        type="text"
        role="combobox"
        aria-label="Search raw imports"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="raw-import-options"
        value={open ? query : selected ? optionLabel(selected) : ''}
        placeholder={
          loading
            ? 'Loading imports…'
            : imports.length
              ? 'Search imports…'
              : 'No raw imports yet'
        }
        disabled={disabled}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && filteredImports.length) {
            event.preventDefault();
            onChange(filteredImports[0].importId);
            setQuery('');
            setOpen(false);
          }
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      />
      {open && !disabled && (
        <div
          id="raw-import-options"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {filteredImports.length ? (
            filteredImports.map((item) => (
              <button
                key={item.importId}
                type="button"
                role="option"
                aria-selected={item.importId === selectedImport}
                onClick={() => {
                  onChange(item.importId);
                  setQuery('');
                  setOpen(false);
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50 aria-selected:bg-indigo-50 dark:text-slate-200 dark:hover:bg-slate-800 dark:aria-selected:bg-slate-800"
              >
                {optionLabel(item)}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              No matching imports.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function RawDataPage({ resource }) {
  const { user } = useSelector((state) => state.auth);
  const [searchParams] = useSearchParams();
  const requestedImportId = searchParams.get('importId') || '';
  const confirm = useConfirm();
  const toast = useToast();
  const [imports, setImports] = useState([]);
  const [selectedImport, setSelectedImport] = useState('');
  const [importsLoading, setImportsLoading] = useState(true);
  const [importsError, setImportsError] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importsVersion, setImportsVersion] = useState(0);
  const [deletingRawRows, setDeletingRawRows] = useState(false);
  const requestId = useRef(0);
  const queryRef = useRef({
    page: 1,
    limit: 25,
    search: '',
    sortBy: '',
    sortOrder: 'asc',
    filters: {},
  });

  const isProspect = resource === 'prospect';
  const title = isProspect ? 'Raw Prospects' : 'Raw Companies';
  const collectionName = isProspect ? 'raw_prospect' : 'raw_Company';
  const columns = data?.import?.columns || [];
  const rows = data?.rows || [];
  const pagination = data?.pagination || {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };
  const activeImport = useMemo(
    () => imports.find((item) => item.importId === selectedImport),
    [imports, selectedImport],
  );
  const isLinkedinDisqualifiedImport =
    resource === 'prospect' &&
    selectedImport === LINKEDIN_DISQUALIFIED_IMPORT_ID;

  useEffect(() => {
    setImports([]);
    setSelectedImport('');
    setData(null);
    setError('');
    setImportsError('');
    setImportsLoading(true);
  }, [resource]);

  useEffect(() => {
    let active = true;
    setImportsLoading(true);
    setImportsError('');

    getRawImportsApi(resource)
      .then(({ imports: availableImports = [] }) => {
        if (!active) return;
        setImports(availableImports);
        setSelectedImport((current) =>
          availableImports.some(
            (item) => item.importId === requestedImportId,
          )
            ? requestedImportId
            : availableImports.some((item) => item.importId === current)
            ? current
            : availableImports[0]?.importId || '',
        );
      })
      .catch((requestError) => {
        if (active) {
          setImportsError(
            requestError?.response?.data?.message ||
              requestError?.message ||
              'Could not load raw imports.',
          );
        }
      })
      .finally(() => {
        if (active) setImportsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [resource, importsVersion, requestedImportId]);

  const loadRows = useCallback(
    (query) => {
      queryRef.current = query;
      const currentRequest = ++requestId.current;
      if (!selectedImport || selectedImport === LINKEDIN_DISQUALIFIED_IMPORT_ID) {
        setData(null);
        setLoading(false);
        setError('');
        return;
      }

      setLoading(true);
      setError('');
      getRawRowsApi(resource, { ...query, importId: selectedImport })
        .then((result) => {
          if (currentRequest === requestId.current) setData(result);
        })
        .catch((requestError) => {
          if (currentRequest === requestId.current) {
            setError(
              requestError?.response?.data?.message ||
                requestError?.message ||
                'Could not load raw rows.',
            );
          }
        })
        .finally(() => {
          if (currentRequest === requestId.current) setLoading(false);
        });
    },
    [resource, selectedImport],
  );

  const deleteRawRows = useCallback(
    async (records) => {
      const ids = [...new Set(
        records
          .filter(
            (row) =>
              String(row.status || '').toLowerCase() === 'disqualified',
          )
          .map((row) => row._id)
          .filter(Boolean),
      )];
      if (!ids.length) {
        toast.warning('Select disqualified raw prospects to delete.');
        return false;
      }

      let deletedCount = 0;
      let skippedCount = 0;
      const confirmed = await confirm({
        title: `Permanently delete ${ids.length} raw prospect(s)?`,
        message:
          'This removes the selected DisQualified rows from Raw Prospects and cannot be undone.',
        confirmLabel: 'Delete selected',
        busyLabel: 'Deleting...',
        onConfirm: async () => {
          setDeletingRawRows(true);
          try {
            const result = await deleteRawDisqualifiedProspectsApi(ids);
            if (!result.deleted) {
              throw new Error(
                result.message || 'No disqualified raw prospects were deleted.',
              );
            }
            deletedCount = result.deleted;
            skippedCount = result.skipped || 0;
            loadRows(queryRef.current);
            setImportsVersion((version) => version + 1);
            return result;
          } finally {
            setDeletingRawRows(false);
          }
        },
      });

      if (!confirmed) return false;
      toast.success(
        `${deletedCount} raw prospect(s) permanently deleted${
          skippedCount ? `; ${skippedCount} skipped` : ''
        }.`,
      );
      return true;
    },
    [confirm, loadRows, toast],
  );

  const getDistinct = useCallback(
    (field, valueSearch, query) =>
      getRawDistinctApi(resource, {
        ...query,
        field,
        importId: selectedImport,
        valueSearch,
      }),
    [resource, selectedImport],
  );

  const exportRows = useCallback(
    (query) =>
      exportRawRowsApi(resource, { ...query, importId: selectedImport }),
    [resource, selectedImport],
  );

  const fieldColumns = activeImport?.columns || columns;
  const fields = useMemo(
    () =>
      fieldColumns.map((column, index) => ({
        key: `raw_${index}`,
        name: column || `Column ${index + 1}`,
        dateFilter: isDateColumn(column),
      })),
    [fieldColumns],
  );

  const cardConfig = useMemo(() => {
    const normalize = (value) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    const findField = (...names) => {
      const aliases = new Set(names.map(normalize));
      const field = fields.find((item) => aliases.has(normalize(item.name)));
      return field?.key;
    };
    if (!isProspect) {
      const nameKey = findField('Company Name', 'Name');
      const domainKey = findField('Domain', 'Company Domain');
      const logoKey = findField('Company Logo', 'Logo', 'Logo URL');
      const industryKey = findField('Main Industry', 'Industry');
      const companySizeKey = findField(
        'Company Size',
        'Employee Size',
        'Employee Size Bracket',
        'Exact Employee Size',
        'See All Employee Size',
      );
      const headquartersPhoneKey = findField(
        'Headquarter Phone',
        'Headquarters Phone',
      );
      const revenueKey = findField(
        'Revenue',
        'Revenue Range',
        'Revenue Bracket',
        'Annual Revenue',
      );
      const items = [
        [industryKey, 'Main Industry'],
        [companySizeKey, 'Company Size'],
        [headquartersPhoneKey, 'Headquarter Phone'],
        [revenueKey, 'Revenue'],
      ]
        .filter(([key]) => key)
        .map(([key, label]) => ({ key, label }));

      return {
        title: (row) => row[nameKey] || row[fields[0]?.key] || '—',
        subtitle: (row) => row[domainKey] || '',
        imageKey: logoKey || undefined,
        imageShape: 'square',
        socialKeys: socialColumns.map((social) => social.key),
        items,
        modalShowAll: true,
      };
    }

    const firstNameKey = findField('First Name', 'Given Name');
    const lastNameKey = findField('Last Name', 'Surname');
    const employeeNameKey = findField('Employee Name', 'Uploader Name');
    const companyNameKey = findField('Company Name', 'Company');
    const specificTitleKey = findField('Specific Title', 'Job Title', 'Title');
    const fallbackKey = fields[0]?.key;
    const statusKey = findField('Status', 'Prospect Status', 'Lead Status');
    const fieldItems = [
      [findField('Email Address', 'Email'), 'Email Address'],
      [findField('Phone Number', 'Phone'), 'Phone Number'],
      [
        findField('LinkedIn Profile Link', 'LinkedIn URL', 'Profile Link'),
        'LinkedIn Profile Link',
      ],
      [findField('City'), 'City'],
      [findField('Country'), 'Country'],
      [findField('Campaign'), 'Campaign'],
      [findField('Date', 'Prospect Date'), 'Date'],
      [employeeNameKey, 'Employee Name'],
      [findField('Work Mode', 'Note 2'), 'Work Mode'],
    ]
      .filter(([key]) => key)
      .map(([key, label]) => ({ key, label }));

    return {
      title: (row) => {
        const name = [row[firstNameKey], row[lastNameKey]]
          .filter((value) => value && value !== '—')
          .join(' ');
        return (
          name ||
          row[employeeNameKey] ||
          row[companyNameKey] ||
          row[fallbackKey] ||
          '—'
        );
      },
      subtitle: (row) =>
        [row[specificTitleKey], row[companyNameKey]]
          .filter((value) => value && value !== '—')
          .join(' · '),
      badgeKey: statusKey || null,
      imageKey: findField('Profile Photo URL', 'Photo URL'),
      socialLabel: isProspect ? 'Company Social Links' : null,
      socialKeys: socialColumns.map((social) => social.key),
      items: fieldItems.length
        ? fieldItems
        : fields.slice(1, 7).map((field) => field.key),
      modalShowAll: true,
    };
  }, [fields, isProspect]);

  const gridRows = useMemo(
    () => {
      const statusIndex = columns.findIndex(
        (column) => normalizeHeader(column) === 'status',
      );
      return rows.map((row) => ({
        _id: row.id,
        rowNumber: row.rowNumber,
        status:
          statusIndex >= 0
            ? formatCell(row.rawData?.[statusIndex]?.value)
            : '',
        ...Object.fromEntries(
          columns.map((_, index) => [
            `raw_${index}`,
            formatCell(row.rawData?.[index]?.value),
          ]),
        ),
        ...getSocialValues(row, columns),
      }));
    },
    [columns, rows],
  );

  const canDeleteRawProspects = isProspect && can(user, 'prospect', 'edit');
  const externalData = useMemo(
    () => ({
      key: `${resource}:${selectedImport}`,
      rows: gridRows,
      pagination,
      loading,
      error,
      onQueryChange: loadRows,
      getDistinct,
      onExport: exportRows,
      selectable: canDeleteRawProspects,
      deleting: deletingRawRows,
      onDeleteRow: canDeleteRawProspects
        ? (row) => deleteRawRows([row])
        : undefined,
      onDeleteSelected: canDeleteRawProspects
        ? (selectedRows) => deleteRawRows(selectedRows)
        : undefined,
      emptyMessage: selectedImport
        ? 'No rows match your search or filters.'
        : 'Import a raw Excel file to get started.',
    }),
    [
      selectedImport,
      resource,
      gridRows,
      pagination,
      loading,
      error,
      loadRows,
      getDistinct,
      exportRows,
      canDeleteRawProspects,
      deletingRawRows,
      deleteRawRows,
    ],
  );

  const headerActions = (
    <>
      <label className="flex items-center gap-2 text-sm">
        <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
          Import file
        </span>
        <SearchableImportSelect
          imports={imports}
          selectedImport={selectedImport}
          onChange={(importId) => {
            setSelectedImport(importId);
            setData(null);
          }}
          disabled={importsLoading || imports.length === 0}
          loading={importsLoading}
        />
      </label>
      {can(user, resource, 'edit') && (
        <button
          type="button"
          className="dgp-btn dgp-btn-primary"
          onClick={() => setShowImport(true)}
        >
          Import Raw Excel
        </button>
      )}
    </>
  );

  const handleImported = (result) => {
    if (result?.importId) setSelectedImport(result.importId);
    setImportsVersion((version) => version + 1);
  };

  return (
    <div className="dgp text-slate-900 dark:text-slate-100">
      {importsError && <div className="dgp-alert">{importsError}</div>}
      {isLinkedinDisqualifiedImport ? (
        <DataGridPage
          key="linkedin-disqualified-prospects"
          resource="prospect"
          title="Raw Prospects — LinkedIn Disqualified"
          headerSubtitle={`${activeImport?.totalRows?.toLocaleString() || 0} DisQualified records remain in Prospect_Database; no duplicate raw records are created.`}
          fields={prospectFields}
          fixedFilters={DISQUALIFIED_FILTERS}
          headerActions={headerActions}
          hideInternalTools
        />
      ) : (
        <DataGridPage
          key={`raw-${resource}`}
          resource={resource}
          title={title}
          headerSubtitle={
            activeImport
              ? `${collectionName} · ${activeImport.totalRows.toLocaleString()} rows · Uploaded by ${activeImport.uploadedByName || '—'}`
              : `Raw Excel rows stored separately in ${collectionName}.`
          }
          fields={fields}
          cardConfig={cardConfig}
          externalData={externalData}
          headerActions={headerActions}
        />
      )}
      {showImport && can(user, resource, 'edit') && (
        <RawExcelImportModal
          resource={resource}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}
    </div>
  );
}
