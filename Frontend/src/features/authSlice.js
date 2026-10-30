
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  loginApi,
  getUserByIdApi,
  meApi,
  logoutApi,
} from '../services/authService';
import { errMsg } from '../services/apiClient';

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const result = await loginApi(email, password);

      if (!result.user) {
        return rejectWithValue('User missing from login response.');
      }

      return { user: result.user };
    } catch (error) {
      return rejectWithValue(errMsg(error));
    }
  }
);

// Fetch logged-in user's current profile using the cookie
export const fetchMe = createAsyncThunk(
  'auth/me',
  async (_, { rejectWithValue }) => {
    try {
      return (await meApi()).user;
    } catch (error) {
      return rejectWithValue(errMsg(error));
    }
  }
);

// Fetch a profile by ID
export const getUserById = createAsyncThunk(
  'auth/getUserById',
  async (userId, { rejectWithValue }) => {
    try {
      return await getUserByIdApi(userId);
    } catch (error) {
      return rejectWithValue(errMsg(error));
    }
  }
);

// Logout and clear the server cookie
export const logoutUser = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await logoutApi();
    } catch (error) {
      return rejectWithValue(errMsg(error));
    }
  }
);

const slice = createSlice({
  name: 'auth',

  initialState: {
    user: null,
    loading: false,
    initialized: false,
    error: null,
  },

  reducers: {
    clearAuthError(state) {
      state.error = null;
    },
    profileUpdated(state, action) {
  state.user = action.payload;
},
  },

  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
     .addCase(login.fulfilled, (state, action) => {
  state.loading = false;
  state.user = action.payload.user;
  state.initialized = true;
  state.error = null;
})
      .addCase(login.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload || 'Login failed';
      })

      .addCase(fetchMe.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMe.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.user = payload;
        state.initialized = true;
      })
      .addCase(fetchMe.rejected, (state) => {
        state.loading = false;
        state.user = null;
        state.initialized = true;
      })

      .addCase(getUserById.fulfilled, (state, { payload }) => {
        // Update current Redux profile if it is the same user
        if (state.user?.id === payload.id) {
          state.user = payload;
        }
      })
      .addCase(getUserById.rejected, (state, { payload }) => {
        state.error = payload || 'Unable to fetch user profile';
      })

      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.error = null;
        state.initialized = true;
      });
  },
});

export const { clearAuthError, profileUpdated } = slice.actions;

export const can = (user, resource, action) =>
  !!user?.role?.permissions?.[resource]?.[action];

export default slice.reducer;
