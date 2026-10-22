import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as api from '../services/dataService';
import { errMsg } from '../services/apiClient';

const thunk = (name, fn) =>
  createAsyncThunk(`data/${name}`, async (arg, { rejectWithValue }) => {
    try {
      return await fn(arg);
    } catch (error) {
      return rejectWithValue(errMsg(error));
    }
  });

// Fetch one page of records with server-side search, sorting and column filters.
export const fetchRows = createAsyncThunk(
  'data/fetchRows',
  async (
    {
      resource,
      page = 1,
      limit = 10,
      search = '',
      sortBy = '',
      sortOrder = 'asc',
      filters = {},
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await api.getRowsApi(resource, {
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        filters,
      });

      return {
        resource,
        data: response.data ?? [],
        pagination: response.pagination ?? {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    } catch (error) {
      return rejectWithValue(errMsg(error));
    }
  }
);

export const addRow = thunk('add', async ({ resource, row }) => ({
  resource,
  row: await api.addRowApi(resource, row),
}));

export const updateRow = thunk(
  'update',
  async ({ resource, id, changes }) => ({
    resource,
    row: await api.updateRowApi(resource, id, changes),
  })
);

export const deleteRow = thunk(
  'delete',
  async ({ resource, id }) => {
    await api.deleteRowApi(resource, id);
    return { resource, id };
  }
);

const initialState = {
  prospect: [],
  company: [],
  pagination: {},
  loading: false,
  error: null,
};

const slice = createSlice({
  name: 'data',
  initialState,

  reducers: {
    // Optimistically update the visible row while saving.
    patchLocal: (state, { payload: { resource, id, changes } }) => {
      state[resource] = (state[resource] ?? []).map((row) =>
        row._id === id ? { ...row, ...changes } : row
      );
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchRows.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchRows.fulfilled, (state, { payload }) => {
        state.loading = false;

        // Store records and pagination separately.
        state[payload.resource] = payload.data;
        state.pagination[payload.resource] = payload.pagination;
      })

      .addCase(addRow.fulfilled, (state, { payload }) => {
        const rows = state[payload.resource] ?? [];
        state[payload.resource] = [payload.row, ...rows];
      })

      .addCase(updateRow.fulfilled, (state, { payload }) => {
        state[payload.resource] = (state[payload.resource] ?? []).map((row) =>
          row._id === payload.row._id ? payload.row : row
        );
      })

      .addCase(deleteRow.fulfilled, (state, { payload }) => {
        state[payload.resource] = (state[payload.resource] ?? []).filter(
          (row) => row._id !== payload.id
        );

        const pagination = state.pagination[payload.resource];

        if (pagination) {
          pagination.total = Math.max(0, pagination.total - 1);
          pagination.totalPages = Math.ceil(pagination.total / pagination.limit);
        }
      })

      .addMatcher(
        (action) =>
          action.type.startsWith('data/') && action.type.endsWith('/rejected'),
        (state, action) => {
          state.loading = false;
          state.error = action.payload || action.error?.message || 'Request failed';
        }
      );
  },
});

export const { patchLocal } = slice.actions;

export default slice.reducer;