import api from './apiClient';

export const getUserActivitiesApi = (params = {}) =>
  api.get("/private/user-activities", { params }).then((response) => response.data);