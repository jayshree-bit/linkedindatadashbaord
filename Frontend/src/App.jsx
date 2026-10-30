import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import { fetchMe } from "./features/authSlice";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/layout/Layout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Prospects from "./pages/Prospects/Prospects";
import Companies from "./pages/Companies";
import UserManager from "./pages/UserManager";
import DashboardProspects from "./pages/Prospects/Dashboard";
import NotificationPage from "./pages/NotificationPage";
import UserActivityPage from "./pages/UserActivityPage";
export default function App() {
  const dispatch = useDispatch();
  const { initialized, user } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(fetchMe());
  }, [dispatch]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Checking your session...
      </div>
    );
  }

  return (
    <Routes>
      {/* Login */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* Shared layout */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Admin-only dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/notifications" element={<NotificationPage />} />
        {/* Permission-protected pages */}
        <Route
          path="/prospects/viewall"
          element={
            <ProtectedRoute resource="prospect">
              <Prospects />
            </ProtectedRoute>
          }
        />

    <Route
    path="/user-activities"
    element={
      <ProtectedRoute resource="user">
        <UserActivityPage />
      </ProtectedRoute>
    }
  />

        <Route
          path="/prospects/dashbaord"
          element={
            <ProtectedRoute resource="prospect">
              <DashboardProspects />
            </ProtectedRoute>
          }
        />

        <Route
          path="/companies"
          element={
            <ProtectedRoute resource="company">
              <Companies />
            </ProtectedRoute>
          }
        />

        <Route
          path="/users"
          element={
            <ProtectedRoute resource="user">
              <UserManager />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
