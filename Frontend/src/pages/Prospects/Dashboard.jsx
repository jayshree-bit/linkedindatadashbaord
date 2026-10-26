import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDashboardStats } from '../../features/dataSlice';
import { useNavigate } from 'react-router-dom';

export default function DashboardProspects() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const {
    global = {},
    users = [],
    selectedUser,
    stats = {},
    loading,
    error,
  } = useSelector((state) => state.data);

  useEffect(() => {
    dispatch(fetchDashboardStats(''));
  }, [dispatch]);

  const handleUserChange = (userId) => {
    dispatch(fetchDashboardStats(userId || ''));
  };

  const selectedUserId = String(
    selectedUser?._id ?? selectedUser?.id ?? ''
  );

  const selectedUserName =
    selectedUser?.name ||
    selectedUser?.email ||
    'Selected user';

  // Opens the prospect grid filtered by status and (if one is selected) the employee.
  const openProspects = (status = '') => {
    const params = new URLSearchParams();

    if (status) {
      params.set('status', status);
    }

    if (selectedUserId) {
      params.set('userId', selectedUserId);
      params.set('employee', selectedUserName);
    }

    const query = params.toString();

    navigate(`/prospects/viewall${query ? `?${query}` : ''}`);
  };

  const cards = [
    {
      label: 'Total Prospects',
      value: global.total ?? 0,
      icon: '👥',
      color: 'blue',
      description: 'All imported prospects',
    },
    {
      label: 'Qualified Prospects',
      value: global.qualified ?? 0,
      icon: '✓',
      color: 'emerald',
      description: 'Qualified records',
    },
    {
      label: 'Disqualified Prospects',
      value: global.disqualified ?? 0,
      icon: '×',
      color: 'rose',
      description: 'Disqualified records',
    },
  ];

  const cardStyles = {
    blue: {
      icon: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
      accent: 'bg-blue-500',
      glow: 'from-blue-500/10',
    },
    emerald: {
      icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
      accent: 'bg-emerald-500',
      glow: 'from-emerald-500/10',
    },
    rose: {
      icon: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
      accent: 'bg-rose-500',
      glow: 'from-rose-500/10',
    },
  };

  const qualificationRate =
    Number(stats.total) > 0
      ? Math.min(100, Math.max(0, (Number(stats.qualified ?? 0) / Number(stats.total)) * 100))
      : 0;

  return (
    <div className="min-h-full space-y-6 bg-gray-50 p-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:p-6">
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Prospects Dashboard
          </h1>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Monitor prospect totals and qualification status.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleUserChange(selectedUserId)}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          <span aria-hidden="true">↻</span>
          Refresh
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p className="font-semibold">Unable to load dashboard</p>
          <p className="mt-1">{error}</p>

          <button
            type="button"
            onClick={() => handleUserChange(selectedUserId)}
            className="mt-3 font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {/* Global count cards */}
      <section aria-label="Overall prospect statistics">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Overall Statistics</h2>

          {loading && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Updating...
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const style = cardStyles[card.color];

            return (
              <div
                key={card.label}
                className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br ${style.glow} via-white to-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg dark:border-gray-700 dark:via-gray-800 dark:to-gray-800`}
              >
                <div
                  className={`absolute left-0 top-0 h-full w-1 ${style.accent}`}
                />

                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {card.label}
                    </p>

                    <p className="mt-3 text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                      {Number(card.value).toLocaleString()}
                    </p>

                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {card.description}
                    </p>
                  </div>

                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl font-bold ${style.icon}`}
                    aria-hidden="true"
                  >
                    {card.icon}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* User list and selected-user statistics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* User sidebar */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Users</h2>

            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {users.length}
            </span>
          </div>

          {/* All users option */}
          <button
            type="button"
            onClick={() => handleUserChange('')}
            aria-pressed={!selectedUserId}
            className={`mb-3 w-full rounded-xl border px-3 py-3 text-left text-sm font-medium transition ${
              !selectedUserId
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700'
            }`}
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-lg dark:bg-gray-700">
                ◉
              </span>

              <span>
                <span className="block">All users</span>
                <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">
                  Overall prospect statistics
                </span>
              </span>
            </span>
          </button>

          <div className="space-y-2">
            {users.map((user) => {
              const id = String(user._id ?? user.id ?? '');
              const name = user.name || user.email || 'Unnamed user';
              const isSelected = selectedUserId === id;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleUserChange(id)}
                  aria-pressed={isSelected}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {String(name).charAt(0).toUpperCase()}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {name}
                      </span>

                      {user.email && (
                        <span className="mt-1 block truncate text-xs text-gray-500 dark:text-gray-400">
                          {user.email}
                        </span>
                      )}
                    </span>

                    {isSelected && (
                      <span className="text-blue-600 dark:text-blue-400">
                        ✓
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            {!loading && users.length === 0 && (
              <p className="rounded-lg bg-gray-50 px-3 py-5 text-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                No users found.
              </p>
            )}
          </div>
        </section>

        {/* Selected user statistics */}
        <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {selectedUser
                  ? `${selectedUserName} — Statistics`
                  : 'All Prospects Statistics'}
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {selectedUser
                  ? 'Prospect breakdown for the selected user.'
                  : 'Select a user to view their individual breakdown.'}
              </p>
            </div>

            {selectedUser && (
              <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                Selected user
              </span>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => openProspects('')}
              className="rounded-xl text-left transition hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="View all prospects"
            >
              <StatCard label="Total" value={stats.total} icon="▦" color="gray" />
            </button>

            <button
              type="button"
              onClick={() => openProspects('Qualified')}
              className="rounded-xl text-left transition hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              title="View qualified prospects"
            >
              <StatCard label="Qualified" value={stats.qualified} icon="✓" color="emerald" />
            </button>

            <button
              type="button"
              onClick={() => openProspects('DisQualified')}
              className="rounded-xl text-left transition hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-500"
              title="View disqualified prospects"
            >
              <StatCard label="Disqualified" value={stats.disqualified} icon="×" color="rose" />
            </button>
          </div>

          {/* Qualification ratio */}
          {Number(stats.total) > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-600 dark:text-gray-300">
                  Qualification rate
                </span>

                <span className="font-semibold">
                  {qualificationRate.toFixed(1)}%
                </span>
              </div>

              <div
                className="h-2.5 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950"
                role="progressbar"
                aria-label="Qualification rate"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={qualificationRate}
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${qualificationRate}%` }}
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  const styles = {
    gray: {
      icon: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
      border: 'border-gray-200 dark:border-gray-700',
    },
    emerald: {
      icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-900',
    },
    rose: {
      icon: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
      border: 'border-rose-200 dark:border-rose-900',
    },
  };

  const style = styles[color] ?? styles.gray;

  return (
    <div
      className={`rounded-xl border ${style.border} bg-white p-4 dark:bg-gray-900`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {label}
        </p>

        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold ${style.icon}`}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>

      <p className="mt-4 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
        {Number(value ?? 0).toLocaleString()}
      </p>
    </div>
  );
}