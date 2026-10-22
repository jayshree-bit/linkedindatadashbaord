
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logoutUser } from '../../features/authSlice';

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

  // Apply the theme globally to the document.
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
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
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
        <div className="hidden max-w-xs flex-1 md:block">
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
        </div>

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
          <button
            type="button"
            aria-label="Notifications"
            title="Notifications"
            className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ♧
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full border border-white bg-rose-500 dark:border-slate-900" />
          </button>

          <div className="hidden h-9 w-px bg-slate-200 dark:bg-slate-700 sm:block" />

          {/* User profile */}
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-md shadow-indigo-200 dark:shadow-none">
              {initials}
            </div>

            <div className="hidden max-w-32 sm:block">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {user?.name || user?.username || 'User'}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {user?.role?.name || 'Member'}
              </p>
            </div>
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
  );
}
