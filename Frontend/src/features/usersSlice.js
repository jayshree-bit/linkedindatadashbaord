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
const replaceUser = (s, { payload }) => {
  s.list = s.list.map((u) => (u._id === payload._id ? payload : u));
};
export const fetchUsers = thunk("fetch", () => api.getUsersApi());
export const fetchRoles = thunk("fetchRoles", () => api.getRolesApi());
export const addUser = thunk("add", (body) => api.addUserApi(body));
export const changeUserRole = thunk("role", ({ id, roleId }) =>
  api.updateUserApi(id, { roleId }),
);
export const removeUser = thunk("remove", async (id) => {
  await api.deleteUserApi(id);
  return id;
});
export const saveRolePermissions = thunk("savePerm", ({ id, permissions }) =>
  api.updateRoleApi(id, permissions),
);
export const changePassword = thunk("changePassword", (body) => api.changePasswordApi(body));
export const editUser = thunk("edit", ({ id, body }) => api.updateUserApi(id, body));


const slice = createSlice({
  name: "users",
  initialState: { list: [], roles: [], loading: false, error: null },
  reducers: {
    clearError: (s) => {
      s.error = null;
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchUsers.pending, (s) => {
      s.loading = true;
    })
      .addCase(fetchUsers.fulfilled, (s, { payload }) => {
        s.loading = false;
        s.list = payload;
      })
      .addCase(fetchRoles.fulfilled, (s, { payload }) => {
        s.roles = payload;
      })
      .addCase(addUser.fulfilled, (s, { payload }) => {
        s.list.unshift(payload);
      })
            .addCase(changeUserRole.fulfilled, replaceUser)
.addCase(editUser.fulfilled, replaceUser)
    
      .addCase(removeUser.fulfilled, (s, { payload }) => {
        s.list = s.list.filter((u) => u._id !== payload);
      })
      .addCase(saveRolePermissions.fulfilled, (s, { payload }) => {
        s.roles = s.roles.map((r) => (r._id === payload._id ? payload : r));
      })

      .addMatcher(
        (a) => a.type.startsWith("users/") && a.type.endsWith("/rejected"),
        (s, { payload }) => {
          s.loading = false;
          s.error = payload;
        },
      );
  },
});

export const { clearError } = slice.actions;
export default slice.reducer;
