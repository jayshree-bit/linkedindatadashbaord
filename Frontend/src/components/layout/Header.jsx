
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logoutUser } from '../../features/authSlice';
import { io } from 'socket.io-client';
import {
  fetchNotifications,
  markAllNotificationsRead,
  clearAllNotifications,
  addNotification,
} from '../../features/notificationSlice';
function getInitialTheme() {
  try {
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }
  } catch {
    // Fall back to the system preference.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export default function Header({ user, onMenuClick }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [loggingOut, setLoggingOut] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const {
    items: notifications,
    unreadCount,
    loading: notificationsLoading,
  } = useSelector((state) => state.notifications);

  useEffect(() => {
    dispatch(fetchNotifications());

    const apiUrl =
      import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

    const socket = io(apiUrl.replace(/\/api\/?$/, ''), {
      withCredentials: true,
    });

    socket.on('import:notification', (notification) => {
      dispatch(addNotification(notification));
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection failed:', error.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [dispatch]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      'dark',
      theme === 'dark'
    );

    document.documentElement.style.colorScheme = theme;

    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Theme still works for the current session.
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) =>
      current === 'dark' ? 'light' : 'dark'
    );
  };

  const handleOpenNotifications = () => {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);

    if (opening && unreadCount > 0) {
      dispatch(markAllNotificationsRead());
    }
  };

  const handleClearNotifications = async () => {
    const result = await dispatch(clearAllNotifications());

    if (clearAllNotifications.fulfilled.match(result)) {
      dispatch(fetchNotifications());
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await dispatch(logoutUser()).unwrap();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout failed:', error);
      setLoggingOut(false);
    }
  };

  const initials = (user?.name || user?.email || 'U')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isDark = theme === 'dark';

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 text-slate-900 backdrop-blur-xl transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100">
        <div className="flex h-20 items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
          {/* Workspace title and mobile navigation */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open navigation"
              className="rounded-xl border border-slate-200 p-2 text-xl text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
            >
              ☰
            </button>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
                Workspace
              </h2>
              <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
                Welcome back! Here's your sales overview.
              </p>
            </div>
          </div>

          {/* Workspace search */}
          {/* <div className="hidden max-w-xs flex-1 md:block">
            <label className="relative block">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                ⌕
              </span>
              <input
                type="search"
                placeholder="Search workspace..."
                aria-label="Search workspace"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-800 dark:focus:ring-indigo-950"
              />
            </label>
          </div> */}

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                isDark ? 'Switch to light mode' : 'Switch to dark mode'
              }
              aria-pressed={isDark}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span className="text-lg" aria-hidden="true">
                {isDark ? '☀️' : '🌙'}
              </span>
              <span className="hidden sm:inline">
                {isDark ? 'Light' : 'Dark'}
              </span>
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                title="Notifications"
                onClick={handleOpenNotifications}
                className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <span aria-hidden="true">♧</span>

                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        Notifications
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Latest 10 import notifications
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      aria-label="Close notifications"
                      className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notificationsLoading && notifications.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-slate-500">
                        Loading notifications...
                      </p>
                    ) : notifications.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          No notifications yet
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Import activity will appear here.
                        </p>
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((item) => (
                        <div
                          key={item.id || item._id}
                          className="border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-lg dark:bg-indigo-950">
                              {item.type === 'company' ? '🏢' : '👥'}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {item.type === 'company'
                                  ? 'Company import'
                                  : 'Prospect import'}
                              </p>

                              <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">
                                {item.message ||
                                  `${item.uploaderName || 'A user'} completed an import.`}
                              </p>

                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Uploaded by: {item.uploaderName || 'Unknown user'}
                              </p>

                              {item.type === 'prospect' && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                    Qualified: {item.qualifiedCount ?? 0}
                                  </span>
                                  <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                                    Disqualified: {item.disqualifiedCount ?? 0}
                                  </span>
                                </div>
                              )}

                              {item.type === 'company' && (
                                <p className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                                  Companies imported: {item.companyCount ?? item.totalImported ?? 0}
                                </p>
                              )}

                              <p className="mt-2 text-xs text-slate-400">
                                {item.createdAt
                                  ? new Date(item.createdAt).toLocaleString()
                                  : 'Just now'}
                              </p>
                            </div>

                            <span
                              className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                                item.status === 'success'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                  : item.status === 'failed'
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                            >
                              {item.status || 'info'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-1 border-t border-slate-200 p-3 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationsOpen(false);
                        navigate('/notifications');
                      }}
                      className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-slate-800"
                    >
                      View all notifications
                    </button>

                    {notifications.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearNotifications}
                        className="w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Clear notifications
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden h-9 w-px bg-slate-200 dark:bg-slate-700 sm:block" />

            {/* User profile */}
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-md shadow-indigo-200 dark:shadow-none">
                {initials}
              </div>

              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                aria-label="Open user profile"
                className="flex items-center gap-2 rounded-xl p-1.5 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:hover:bg-slate-800"
              >
                <div className="hidden max-w-32 sm:block">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {user?.name || user?.username || 'User'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {user?.role?.name || 'Member'}
                  </p>
                </div>
              </button>
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-900 dark:hover:bg-rose-950 dark:hover:text-rose-400"
            >
              <span className="hidden sm:inline">
                {loggingOut ? 'Signing out...' : 'Log out'}
              </span>
              <span className="sm:hidden">↪</span>
            </button>
          </div>
        </div>
      </header>

    {profileOpen && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
    onClick={() => setProfileOpen(false)}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Modal header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-800">
        <div>
          <h2
            id="profile-modal-title"
            className="text-lg font-bold text-slate-900 dark:text-white"
          >
            My Profile
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            View your account information
          </p>
        </div>

        <button
          type="button"
          onClick={() => setProfileOpen(false)}
          aria-label="Close profile"
          className="rounded-lg p-2 text-xl text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          &times;
        </button>
      </div>

      {/* Profile details */}
      <div className="p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-bold text-white">
            {initials}
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-slate-900 dark:text-white">
              {user?.name || user?.username || "User"}
            </h3>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {user?.role?.name || "Member"}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {[
            ["Full Name", user?.name],
            ["Username", user?.username],
            ["Email Address", user?.email],
            ["Phone Number", user?.phone],
            ["Role", user?.role?.name],
          ].map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-800"
            >
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {label}
              </p>
              <p className="break-words text-right text-sm font-medium text-slate-800 dark:text-slate-100">
                {value || "Not provided"}
              </p>
            </div>
          ))}
        </div>

        {/* Role permissions */}
        <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
          <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-white">
            My Permissions
          </h4>

          <div className="space-y-3">
            {["prospect", "company", "user"].map((resource) => (
              <div
                key={resource}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-sm capitalize text-slate-600 dark:text-slate-300">
                  {resource}
                </span>

                <div className="flex gap-2">
                  {["view", "edit"].map((action) => {
                    const allowed =
                      user?.role?.permissions?.[resource]?.[action] === true;

                    return (
                      <span
                        key={action}
                        className={`rounded-md px-2 py-1 text-xs font-medium ${
                          allowed
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                        }`}
                      >
                        {action}: {allowed ? "Yes" : "No"}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

       
      </div>
    </div>
  </div>
)}
    </>
  );
}
