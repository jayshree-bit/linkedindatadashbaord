
import {
  createContext,
  useContext,
  useMemo,
} from 'react';

import { useDispatch, useSelector } from 'react-redux';

import {
  login as loginAction,
  logoutUser,
  fetchMe,
  getUserById,
  can,
} from '../features/authSlice';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const dispatch = useDispatch();

  const { user, loading, initialized, error } = useSelector(
    (state) => state.auth
  );

  console.log("user>>>", user)
  const login = async (email, password) => {
    return dispatch(
      loginAction({ email, password })
    ).unwrap();
  };

  const logout = async () => {
    return dispatch(logoutUser()).unwrap();
  };

  const refreshUser = async () => {
    return dispatch(fetchMe()).unwrap();
  };

  const getUserProfile = async (userId) => {
    return dispatch(getUserById(userId)).unwrap();
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      initialized,
      error,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshUser,
      getUserProfile,
      can: (resource, action) => can(user, resource, action),
    }),
    [user, loading, initialized, error]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
};
