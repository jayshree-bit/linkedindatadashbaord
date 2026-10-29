
import api from './apiClient';

// Assumes your existing Axios instance is exported as `api`.
// It should already have the backend base URL and withCredentials: true.

export const uploadProfilePhoto = async (file) => {
  const formData = new FormData();
  formData.append("profilePhoto", file);

  const { data } = await api.patch(
    "/auth/profile-photo",
    formData
  );

  return data.user;
};
