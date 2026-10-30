
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getUserActivitiesApi } from "../services/userActivityService";

export const fetchUserActivities = createAsyncThunk(
  "userActivity/fetchUserActivities",
  async (params = {}, { rejectWithValue }) => {
    try {
      return await getUserActivitiesApi(params);
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to load user activities"
      );
    }
  }
);

const userActivitySlice = createSlice({
  name: "userActivity",
  initialState: {
    activities: [],
    total: 0,
    page: 1,
    limit: 10,
    loading: false,
    error: null,
  },
  reducers: {
    clearUserActivityError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserActivities.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUserActivities.fulfilled, (state, action) => {
        state.loading = false;

        const payload = action.payload;

        // Supports common API response formats.
        state.activities =
          payload.activities ?? payload.data ?? payload.results ?? [];

        state.total =
          payload.pagination?.total ??
          payload.total ??
          payload.totalRecords ??
          state.activities.length;

        state.page = payload.pagination?.page ?? payload.page ?? state.page;
        state.limit = payload.pagination?.limit ?? payload.limit ?? state.limit;
      })
      .addCase(fetchUserActivities.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Something went wrong";
      });
  },
});

export const { clearUserActivityError } = userActivitySlice.actions;
export default userActivitySlice.reducer;
