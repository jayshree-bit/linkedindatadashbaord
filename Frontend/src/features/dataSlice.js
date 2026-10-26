import { createSlice, createAsyncThunk, isAnyOf } from '@reduxjs/toolkit';
import * as api from '../services/dataService';
import { errMsg } from '../services/apiClient';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

export const fetchDashboardStats = createAsyncThunk(
  'dashboard/fetchStats',
  async (userId = '', { rejectWithValue }) => {
    try {
      return await api.getDashboardStatsApi(userId);
    } catch (error) {
      return rejectWithValue(errMsg(error));
    }
  }
);
export const importProspects = createAsyncThunk(
  'import/prospects',
  async ({ status, file, uploadedBy }, { dispatch, rejectWithValue }) => {
    try {
      // 1) Upload (phase "uploading"), the server answers with a job id.
      const { jobId } = await api.importProspectsApi(status, file, uploadedBy, (percent) =>
        dispatch(setImportProgress(percent))
      );

      dispatch(
        setImportProcessing({ stage: 'Starting', percent: 0, processed: null, total: null })
      );

      // 2) Poll the server until the job is done.
      let failures = 0;
      for (;;) {
        await sleep(700);

        let job;
        try {
          job = await api.getImportStatusApi(jobId);
          failures = 0;
        } catch (error) {
          // Job gone (404) is final; tolerate a few network blips otherwise.
          if (error?.response?.status === 404 || ++failures >= 5) throw error;
          continue;
        }

        if (job.state === 'failed') return rejectWithValue(job.error || 'Import failed.');
        if (job.state === 'done') return job.result;

        dispatch(
          setImportProcessing({
            stage: job.stage,
            percent: job.percent,
            processed: job.processed,
            total: job.total,
          })
        );
      }
    } catch (error) {
      return rejectWithValue(errMsg(error));
    }
  }
);

export const fetchDashboard = createAsyncThunk(
  'dashboard/fetchOverview',
  async ({ from = '', to = '', limit = 10 } = {}, { rejectWithValue }) => {
    try {
      const res = await api.getDashboardApi({ from, to, limit });
      return res?.data ?? res; // API returns { success, data }
    } catch (error) {
      return rejectWithValue(errMsg(error));
    }
  }
);

export const importCompanies = createAsyncThunk(
  'import/companies',
  async ({ file, uploadedBy }, { dispatch, rejectWithValue }) => {
    try {
      const { jobId } = await api.importCompaniesApi(file, uploadedBy, (percent) =>
        dispatch(setImportProgress(percent))
      );

      dispatch(setImportProcessing({ stage: 'Starting', percent: 0, processed: null, total: null }));

      let failures = 0;
      for (;;) {
        await sleep(700);

        let job;
        try {
          job = await api.getCompanyImportStatusApi(jobId);
          failures = 0;
        } catch (error) {
          if (error?.response?.status === 404 || ++failures >= 5) throw error;
          continue;
        }

        if (job.state === 'failed') return rejectWithValue(job.error || 'Import failed.');
        if (job.state === 'done') return job.result;

        dispatch(
          setImportProcessing({
            stage: job.stage,
            percent: job.percent,
            processed: job.processed,
            total: job.total,
          })
        );
      }
    } catch (error) {
      return rejectWithValue(errMsg(error));
    }
  }
);
const initialState = {
  prospect: [],
  company: [],
  pagination: {},
  dashboard: { data: null, loading: false, error: null },
   global: {
    total: 0,
    qualified: 0,
    disqualified: 0,
  },
  users: [],
  selectedUser: null,
  stats: {
    total: 0,
    qualified: 0,
    disqualified: 0,
  },
  loading: false,
  error: null,
    importState: {
    loading: false,
    phase: 'idle',   // 'idle' | 'uploading' | 'processing'
    progress: 0,     // upload percent
    stage: '',       // "Reading file" | "Checking duplicates" | "Saving rows"
    percent: 0,      // import percent (server side)
    processed: null,
    total: null,
    result: null,
    error: null,
  },
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
     setImportProgress: (state, { payload }) => {
      state.importState.phase = 'uploading';
      state.importState.progress = payload;
    },

    setImportProcessing: (state, { payload }) => {
      state.importState.phase = 'processing';
      state.importState.stage = payload.stage;
      state.importState.percent = payload.percent;
      state.importState.processed = payload.processed;
      state.importState.total = payload.total;
    },
     resetImport: (state) => {
      state.importState = initialState.importState;
    },
    clearDashboardError(state) {
      state.error = null;
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
       .addCase(importProspects.pending, (state) => {
        state.importState = {
          ...initialState.importState,
          loading: true,
          phase: 'uploading',
        };
      })

     .addCase(importProspects.fulfilled, (state, { payload }) => {
        state.importState = {
          ...initialState.importState,
          phase: 'idle',
          progress: 100,
          percent: 100,
          result: payload,
        };
      })

     .addCase(importProspects.rejected, (state, { payload, error }) => {
        state.importState = {
          ...initialState.importState,
          error: payload || error?.message || 'Import failed.',
        };
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
  .addCase(fetchDashboardStats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardStats.fulfilled, (state, { payload }) => {
        state.loading = false;

        // Supports an API response wrapped in { data: {...} }
        // or a direct dashboard object.
        const result = payload?.data ?? payload ?? {};

        state.global = {
          ...initialState.global,
          ...(result.global ?? {}),
        };

        state.users = result.users ?? [];
        state.selectedUser = result.selectedUser ?? null;

        state.stats = {
          ...initialState.stats,
          ...(result.stats ?? {}),
        };
      })
      .addCase(fetchDashboardStats.rejected, (state, { payload, error }) => {
        state.loading = false;
        state.error = payload || error.message || 'Failed to load dashboard';
      })
      .addCase(fetchDashboard.pending, (state) => {
        state.dashboard.loading = true;
        state.dashboard.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, { payload }) => {
        state.dashboard.loading = false;
        state.dashboard.data = payload;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        if (action.meta?.aborted) return; // a newer date range replaced this request
        state.dashboard.loading = false;
        state.dashboard.error =
          action.payload || action.error?.message || 'Failed to load dashboard';
      })

      .addMatcher(isAnyOf(importProspects.pending, importCompanies.pending), (state) => {
        state.importState = { ...initialState.importState, loading: true, phase: 'uploading' };
      })
      .addMatcher(isAnyOf(importProspects.fulfilled, importCompanies.fulfilled), (state, { payload }) => {
        state.importState = {
          ...initialState.importState,
          phase: 'idle',
          progress: 100,
          percent: 100,
          result: payload,
        };
      })
      .addMatcher(isAnyOf(importProspects.rejected, importCompanies.rejected), (state, { payload, error }) => {
        state.importState = {
          ...initialState.importState,
          error: payload || error?.message || 'Import failed.',
        };
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

export const { patchLocal,setImportProgress, setImportProcessing, resetImport, clearDashboardError } = slice.actions;

export default slice.reducer;