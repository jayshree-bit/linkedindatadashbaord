import api from "./apiClient";
export const getUsersApi = () => api.get("/private/users").then((r) => r.data);
export const getRolesApi = () => api.get("/private/roles").then((r) => r.data);
export const addUserApi = (body) =>
  api.post("/private/users", body).then((r) => r.data);
export const updateUserApi = (id, body) =>
  api.put(`/private/users/${id}`, body).then((r) => r.data);
export const deleteUserApi = (id) =>
  api.delete(`/private/users/${id}`).then((r) => r.data);
export const updateRoleApi = (id, permissions) =>
  api.put(`/private/roles/${id}`, { permissions }).then((r) => r.data);
export const changePasswordApi = (body) =>
  api.put("/auth/change-password", body).then((r) => r.data);
