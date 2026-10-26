
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import {
  getNotificationsApi,
  markNotificationsReadApi,
  clearNotificationsApi,
} from '../services/notificationService';

const getError = (error) =>
  error.response?.data?.message || error.message || 'Request failed';

// Header: always fetch the latest 10.
export const fetchNotifications = createAsyncThunk(
  'notifications/fetchLatest',
  async (_, { rejectWithValue }) => {
    try {
      return await getNotificationsApi({ page: 1, limit: 10 });
    } catch (error) {
      return rejectWithValue(getError(error));
    }
  }
);

// View All page: fetch the selected page.
export const fetchAllNotifications = createAsyncThunk(
  'notifications/fetchAll',
  async ({ page = 1, limit = 20 } = {}, { rejectWithValue }) => {
    try {
      return await getNotificationsApi({ page, limit });
    } catch (error) {
      return rejectWithValue(getError(error));
    }
  }
);

export const markAllNotificationsRead = createAsyncThunk(
  'notifications/markAllRead',
  async (_, { rejectWithValue }) => {
    try {
      return await markNotificationsReadApi();
    } catch (error) {
      return rejectWithValue(getError(error));
    }
  }
);

export const clearAllNotifications = createAsyncThunk(
  'notifications/clearAll',
  async (_, { rejectWithValue }) => {
    try {
      await clearNotificationsApi();
      return true;
    } catch (error) {
      return rejectWithValue(getError(error));
    }
  }
);

const initialState = {
  items: [],
  unreadCount: 0,
  loading: false,
  error: null,

  // Separate data for the View All page.
  allItems: [],
  allLoading: false,
  allError: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,

  reducers: {
    addNotification: (state, action) => {
      const notification = action.payload;
      const id = notification.id || notification._id;

      if (
        state.items.some(
          (item) => (item.id || item._id) === id
        )
      ) {
        return;
      }

      state.items.unshift(notification);
      state.items = state.items.slice(0, 10);

      if (!notification.isRead) {
        state.unreadCount += 1;
      }

      // Keep the View All list in sync if this notification is
      // already present there, without duplicating it.
      const existsInAll = state.allItems.some(
        (item) => (item.id || item._id) === id
      );

      if (!existsInAll && state.pagination.page === 1) {
        state.allItems.unshift(notification);
        state.allItems = state.allItems.slice(0, state.pagination.limit);
        state.pagination.total += 1;
        state.pagination.totalPages = Math.ceil(
          state.pagination.total / state.pagination.limit
        );
      }
    },
  },

  extraReducers: (builder) => {
    builder
      // Latest 10 for Header.
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.notifications || [];
        state.unreadCount = action.payload.unreadCount || 0;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })

      // Paginated list for View All.
      .addCase(fetchAllNotifications.pending, (state) => {
        state.allLoading = true;
        state.allError = null;
      })
      .addCase(fetchAllNotifications.fulfilled, (state, action) => {
        state.allLoading = false;
        state.allItems = action.payload.notifications || [];
        state.pagination = action.payload.pagination || state.pagination;
        state.unreadCount = action.payload.unreadCount || 0;
      })
      .addCase(fetchAllNotifications.rejected, (state, action) => {
        state.allLoading = false;
        state.allError = action.payload || action.error.message;
      })

      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        state.items = state.items.map((item) => ({
          ...item,
          isRead: true,
        }));

        state.allItems = state.allItems.map((item) => ({
          ...item,
          isRead: true,
        }));

        state.unreadCount = 0;
      })
      .addCase(markAllNotificationsRead.rejected, (state, action) => {
        state.error = action.payload || action.error.message;
      })

      .addCase(clearAllNotifications.fulfilled, (state) => {
        state.items = [];
        state.allItems = [];
        state.unreadCount = 0;
        state.pagination = {
          ...state.pagination,
          page: 1,
          total: 0,
          totalPages: 0,
        };
      })
      .addCase(clearAllNotifications.rejected, (state, action) => {
        state.error = action.payload || action.error.message;
      });
  },
});

export const { addNotification } = notificationSlice.actions;
export default notificationSlice.reducer;
