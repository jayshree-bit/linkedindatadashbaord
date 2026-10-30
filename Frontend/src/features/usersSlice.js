
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as api from "../services/userService";
import { errMsg } from "../services/apiClient";

const thunk = (name, fn) =>
  createAsyncThunk(`users/${name}`, async (arg, { rejectWithValue }) => {
    try {
      return await fn(arg);
    } catch (e) {
      return rejectWithValue(errMsg(e));
    }
  });

const replaceUser = (state, { payload }) => {
  if (!payload?._id) return;

  state.list = state.list.map((user) =>
    user._id === payload._id ? payload : user
  );
};

export const fetchUsers = thunk("fetch", () => api.getUsersApi());

export const fetchRoles = thunk("fetchRoles", () => api.getRolesApi());

export const addUser = thunk("add", (body) => api.addUserApi(body));

export const changeUserRole = thunk("role", ({ id, roleId }) =>
  api.updateUserApi(id, { roleId })
);

export const removeUser = thunk("remove", async (id) => {
  await api.deleteUserApi(id);
  return id;
});

export const saveRolePermissions = thunk(
  "savePerm",
  ({ id, permissions }) => api.updateRoleApi(id, permissions)
);

export const changePassword = thunk("changePassword", (body) =>
  api.changePasswordApi(body)
);

export const editUser = thunk("edit", ({ id, body }) =>
  api.updateUserApi(id, body)
);

// Update the authenticated user's own profile.
export const updateMyProfile = thunk(
  "updateMyProfile",
  (body) => api.updateMyProfileApi(body)
);

const slice = createSlice({
  name: "users",

  initialState: {
    list: [],
    roles: [],
    loading: false,
    error: null,
  },

  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.list = Array.isArray(payload) ? payload : [];
      })
      .addCase(fetchUsers.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload || "Failed to load users";
      })

      .addCase(fetchRoles.fulfilled, (state, { payload }) => {
        state.roles = payload;
      })

      .addCase(addUser.fulfilled, (state, { payload }) => {
        state.list.unshift(payload);
      })

      .addCase(changeUserRole.fulfilled, replaceUser)
      .addCase(editUser.fulfilled, replaceUser)

      .addCase(removeUser.fulfilled, (state, { payload }) => {
        state.list = state.list.filter((user) => user._id !== payload);
      })

      .addCase(saveRolePermissions.fulfilled, (state, { payload }) => {
        state.roles = state.roles.map((role) =>
          role._id === payload._id ? payload : role
        );
      })

      // Profile update states
      .addCase(updateMyProfile.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateMyProfile.fulfilled, (state) => {
        state.loading = false;
        state.error = null;
      })
      .addCase(updateMyProfile.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload || "Failed to update profile";
      })

      // Handle errors from other users actions.
      .addMatcher(
        (action) =>
          Boolean(action?.type?.startsWith("users/")) &&
          action.type.endsWith("/rejected"),
        (state, { payload }) => {
          state.loading = false;
          state.error = payload || "Something went wrong";
        }
      );
  },
});

export const { clearError } = slice.actions;

export default slice.reducer;
