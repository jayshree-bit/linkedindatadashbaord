
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';

    if (
      error.response?.status === 401 &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/me') &&
      !url.includes('/auth/logout')
    ) {
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export const errMsg = (error) =>
  error.response?.data?.message || error.message;

export default apiClient;
