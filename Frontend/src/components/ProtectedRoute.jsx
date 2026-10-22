import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { can } from '../features/authSlice';

export default function ProtectedRoute({
  resource,
  adminOnly = false,
  children,
}) {
  const { user, initialized } = useSelector((state) => state.auth);
  const location = useLocation();

  if (!initialized) {
    return <p>Checking your session...</p>;
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  // Dashboard is restricted to Admin.
  if (adminOnly && user.role?.name?.toLowerCase() !== 'admin') {
    return <p className="p-6 text-red-600">You do not have access to this page.</p>;
  }

  // Permission checks for other pages.
  if (resource && !can(user, resource, 'view')) {
    return <p className="p-6 text-red-600">You do not have access to this page.</p>;
  }

  return children;
}