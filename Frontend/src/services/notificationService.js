
import api from './apiClient';

// Fetch notifications for a specific page.
export const getNotificationsApi = ({
  page = 1,
  limit = 10,
} = {}) =>
  api
    .get('/private/notifications', {
      params: { page, limit },
    })
    .then((response) => response.data);

export const markNotificationsReadApi = () =>
  api
    .patch('/private/notifications/read')
    .then((response) => response.data);

export const clearNotificationsApi = () =>
  api
    .delete('/private/notifications')
    .then((response) => response.data);
