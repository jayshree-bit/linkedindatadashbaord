import axios from 'axios';

// Production: VITE_API_URL=/api (Netlify proxies it to Render, cookie stays first-party)
// Local dev: falls back to the local backend

const apiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    "http://192.168.1.142:5000/api",
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
      console.warn('401 from', url);

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export const errMsg = (error) =>
  error.response?.data?.message || error.message;

export default apiClient;