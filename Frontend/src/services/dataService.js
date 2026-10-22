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
export const exportRowsApi = (
  resource,
  { search = '', sortBy = '', sortOrder = 'asc', filters = {}, columns = [] } = {}
) =>
  api
    .get(`/private/data/${resource}/export`, {
      params: {
        search,
        sortBy,
        sortOrder,
        filters: Object.keys(filters).length ? JSON.stringify(filters) : '',
        columns: JSON.stringify(columns),
      },
      responseType: 'blob',
      timeout: 0, // large exports can take a while
    })
    .then((response) => response.data);