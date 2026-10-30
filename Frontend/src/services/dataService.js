import api from './apiClient';

// Fetch paginated, searchable, sortable, column-filtered records.
export const getRowsApi = (
  resource,
  {
    page = 1,
    limit = 10,
    search = '',
    sortBy = '',
    sortOrder = 'asc',
    filters = {},
  } = {}
) =>
  api
    .get(`/private/data/${resource}`, {
      params: {
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        filters: Object.keys(filters).length ? JSON.stringify(filters) : '',
      },
    })
    .then((response) => response.data);

export const addRowApi = (resource, row) =>
  api.post(`/private/data/${resource}`, row).then((response) => response.data);

export const updateRowApi = (resource, id, changes) =>
  api.put(`/private/data/${resource}/${id}`, changes).then((response) => response.data);

export const deleteRowApi = (resource, id) =>
  api.delete(`/private/data/${resource}/${id}`).then((response) => response.data);

export const getDashboardStatsApi = (employeeName = '') =>
  api
    .get('/private/dashboard-stats', {
      params: employeeName ? { employeeName } : {},
    })
    .then((response) => response.data);
// Distinct values for the column filter checklist.
export const getDistinctApi = (
  resource,
  field,
  { search = '', filters = {}, valueSearch = '', limit = 200 } = {}
) =>
  api
    .get(`/private/data/${resource}/distinct/${encodeURIComponent(field)}`, {
      params: {
        search,
        valueSearch,
        limit,
        filters: Object.keys(filters).length ? JSON.stringify(filters) : '',
      },
    })
    .then((response) => response.data);

// Download every record matching the current search / sort / column filters as .xlsx.

const exportParams = ({ columns, filters, ...rest }) => ({
  ...rest,
  filters: JSON.stringify(filters ?? {}),
  columns: JSON.stringify(columns ?? []),
});

export const exportStartApi = async (resource, params) =>
  (await api.get(`/private/data/${resource}/export-start`, { params: exportParams(params) })).data;

export const exportStatusApi = async (resource, jobId) =>
  (await api.get(`/private/data/${resource}/export-status/${jobId}`)).data;

export const exportFileApi = async (resource, jobId) =>
  (await api.get(`/private/data/${resource}/export-file/${jobId}`, {
    responseType: "blob",
    timeout: 0,
  })).data;
export const exportRowsApi = async (resource, params, onProgress) => {
  const { columns, filters, ...rest } = params;

  const res = await api.get(`/private/data/${resource}/export`, {
    params: {
      ...rest,
      filters: JSON.stringify(filters ?? {}),
      columns: JSON.stringify(columns ?? []),
    },
    responseType: 'blob',
    timeout: 0, // no timeout for big exports
    onDownloadProgress: (e) => onProgress?.(e.loaded),
  });

  return res.data;
};


export const importProspectsApi = (status, file,uploadedBy, onProgress) => {
  const formData = new FormData();
  formData.append('status', status);
    formData.append('uploadedBy', uploadedBy);

  formData.append('file', file);

  return api
    .post('/private/data/prospect/import-excel', formData, {
      timeout: 0,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    })
    .then((response) => response.data);
};

export const getImportStatusApi = (jobId) =>
  api
    .get(`/private/data/prospect/import-excel/${encodeURIComponent(jobId)}`)
    .then((response) => response.data);

// Dashboard overview (date range). from / to are "YYYY-MM-DD".
export const getDashboardApi = ({ from = '', to = '', limit = 10 } = {}) =>
  api
    .get('/private/dashboard', {
      params: {
        ...(from && { from }),
        ...(to && { to }),
        limit,
      },
    })
    .then((response) => response.data);


export const importCompaniesApi = (file, uploadedBy, onProgress) => {
  const formData = new FormData();
  formData.append('uploadedBy', uploadedBy);
  formData.append('file', file);

  return api
    .post('/private/data/company/import-excel', formData, {
      timeout: 0,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    })
    .then((response) => response.data);
};

export const getCompanyImportStatusApi = (jobId) =>
  api
    .get(`/private/data/company/import-excel/${encodeURIComponent(jobId)}`)
    .then((response) => response.data);


export const uploadCompanyListApi = async (file) => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/private/data/prospect/company-list', form);
  return data; // { listId, domainCount, nameCount }
};

export const downloadCompanyListSampleApi = async () => {
  const { data } = await api.get('/private/data/prospect/company-list/sample', {
    responseType: 'blob',
  });
  return data;
};

export const updateLinkedinProfilesApi = (resource, ids) =>
  api.post('/private/linkedin-update', { resource, ids }).then((r) => r.data);