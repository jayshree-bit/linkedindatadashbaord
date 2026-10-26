
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  fetchAllNotifications,
  markAllNotificationsRead,
  clearAllNotifications,
} from '../features/notificationSlice';

export default function NotificationPage() {
  const dispatch = useDispatch();

  const {
    allItems,
    allLoading,
    allError,
    unreadCount,
    pagination,
  } = useSelector((state) => state.notifications);

  const { page, limit, total, totalPages } = pagination;

  useEffect(() => {
    dispatch(fetchAllNotifications({ page, limit }));
  }, [dispatch, page, limit]);

  const goToPage = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return;

    dispatch(fetchAllNotifications({ page: nextPage, limit }));
  };

  const handleMarkAllRead = async () => {
    const result = await dispatch(markAllNotificationsRead());

    if (markAllNotificationsRead.fulfilled.match(result)) {
      dispatch(fetchAllNotifications({ page, limit }));
    }
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to clear all notifications?'
    );

    if (!confirmed) return;

    const result = await dispatch(clearAllNotifications());

    if (clearAllNotifications.fulfilled.match(result)) {
      dispatch(fetchAllNotifications({ page: 1, limit }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold">
              All Notifications
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Import activity across your workspace
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Total: {total} · Unread: {unreadCount}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              Mark all as read
            </button>

            <button
              type="button"
              onClick={handleClearAll}
              disabled={total === 0}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Clear all
            </button>
          </div>
        </div>

        {allError && (
          <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {allError}
          </div>
        )}

        {allLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            Loading notifications...
          </div>
        ) : allItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="font-semibold">No notifications found</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Import activity will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {allItems.map((item) => (
              <div
                key={item.id || item._id}
                className="border-b border-slate-100 p-4 last:border-b-0 dark:border-slate-800"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl dark:bg-indigo-950">
                    {item.type === 'company' ? '🏢' : '👥'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">
                        {item.type === 'company'
                          ? 'Company import'
                          : 'Prospect import'}
                      </h2>

                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          item.status === 'success'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : item.status === 'failed'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {item.status || 'info'}
                      </span>

                      {!item.isRead && (
                        <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          New
                        </span>
                      )}
                    </div>

                    <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">
                      {item.message ||
                        `${item.uploaderName || 'A user'} completed an import.`}
                    </p>

                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Uploaded by: {item.uploaderName || 'Unknown user'}
                    </p>

                    {item.type === 'prospect' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          Qualified: {item.qualifiedCount ?? 0}
                        </span>
                        <span className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                          Disqualified: {item.disqualifiedCount ?? 0}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          Total: {item.totalImported ?? 0}
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
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {total === 0
              ? 'Showing 0 notifications'
              : `Showing ${(page - 1) * limit + 1}–${Math.min(
                  page * limit,
                  total
                )} of ${total}`}
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || allLoading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Previous
            </button>

            <span className="text-sm">
              Page {page} of {Math.max(totalPages, 1)}
            </span>

            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || allLoading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
