import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { can } from '../features/authSlice';
import DataGridPage from '../components/DataGridPage';
import RawExcelImportModal from '../components/RawExcelImportModal';
import {
  exportRawRowsApi,
  getRawDistinctApi,
  getRawImportsApi,
  getRawRowsApi,
} from '../services/dataService';

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

export default function RawDataPage({ resource }) {
  const { user } = useSelector((state) => state.auth);
  const [imports, setImports] = useState([]);
  const [selectedImport, setSelectedImport] = useState('');
  const [importsLoading, setImportsLoading] = useState(true);
  const [importsError, setImportsError] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importsVersion, setImportsVersion] = useState(0);
  const requestId = useRef(0);

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

  useEffect(() => {
    let active = true;
    setImportsLoading(true);
    setImportsError('');

    getRawImportsApi(resource)
      .then(({ imports: availableImports = [] }) => {
        if (!active) return;
        setImports(availableImports);
        setSelectedImport((current) =>
          availableImports.some((item) => item.importId === current)
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
  }, [resource, importsVersion]);

  const loadRows = useCallback(
    (query) => {
      const currentRequest = ++requestId.current;
      if (!selectedImport) {
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
    if (!isProspect) return undefined;
    const normalize = (value) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    const findField = (...names) => {
      const aliases = new Set(names.map(normalize));
      const field = fields.find((item) => aliases.has(normalize(item.name)));
      return field?.key;
    };
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
    () =>
      rows.map((row) => ({
        _id: row.id,
        rowNumber: row.rowNumber,
        ...Object.fromEntries(
          columns.map((_, index) => [
            `raw_${index}`,
            formatCell(row.rawData?.[index]?.value),
          ]),
        ),
        ...getSocialValues(row, columns),
      })),
    [columns, rows],
  );

  const externalData = useMemo(
    () => ({
      key: selectedImport,
      rows: gridRows,
      pagination,
      loading,
      error,
      onQueryChange: loadRows,
      getDistinct,
      onExport: exportRows,
      emptyMessage: selectedImport
        ? 'No rows match your search or filters.'
        : 'Import a raw Excel file to get started.',
    }),
    [
      selectedImport,
      gridRows,
      pagination,
      loading,
      error,
      loadRows,
      getDistinct,
      exportRows,
    ],
  );

  const headerActions = (
    <>
      <label className="flex items-center gap-2 text-sm">
        <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
          Import file
        </span>
        <select
          value={selectedImport}
          onChange={(event) => {
            setSelectedImport(event.target.value);
            setData(null);
          }}
          disabled={importsLoading || imports.length === 0}
          className="max-w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          aria-label="Select raw import file"
        >
          {imports.length === 0 ? (
            <option value="">No raw imports yet</option>
          ) : (
            imports.map((item) => (
              <option key={item.importId} value={item.importId}>
                {item.fileName} · {item.totalRows.toLocaleString()} rows ·{' '}
                {formatDate(item.importedAt)}
              </option>
            ))
          )}
        </select>
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
      <DataGridPage
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
