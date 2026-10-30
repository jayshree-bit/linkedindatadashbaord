
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchUserActivities } from "../features/userActivitySlice";

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
};

const getUserName = (user) => {
  if (!user) return "Unknown user";
  if (typeof user === "string") return user;

  return user.name || user.fullName || user.email || "Unknown user";
};

const getActionStyle = (action = "") => {
  const value = action.toUpperCase();

  if (value.includes("DELETE")) {
    return "bg-red-100 text-red-700";
  }

  if (value.includes("CREATE") || value.includes("IMPORT")) {
    return "bg-green-100 text-green-700";
  }

  if (value.includes("UPDATE")) {
    return "bg-amber-100 text-amber-700";
  }

  if (value.includes("EXPORT")) {
    return "bg-purple-100 text-purple-700";
  }

  return "bg-blue-100 text-blue-700";
};

export default function UserActivityPage() {
  const dispatch = useDispatch();

const {
  activities = [],
  total = 0,
  loading = false,
  error = null,
  page = 1,
  limit = 10,
} = useSelector((state) => state.userActivities ?? {});

  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedActivity, setSelectedActivity] = useState(null);

  const loadActivities = (nextPage = currentPage) => {
    const params = {
      page: nextPage,
      limit: pageSize,
    };

    if (action) params.action = action;
    if (search.trim()) params.search = search.trim();

    dispatch(fetchUserActivities(params));
  };

  useEffect(() => {
    loadActivities(currentPage);
    // Fetch on initial load and when pagination changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, currentPage, pageSize]);

  const handleFilter = (event) => {
    event.preventDefault();
    setCurrentPage(1);

    const params = { page: 1, limit: pageSize };
    if (action) params.action = action;
    if (search.trim()) params.search = search.trim();

    dispatch(fetchUserActivities(params));
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            User Activity
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track user actions and activity across the portal.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadActivities(currentPage)}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Total Activities
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {total.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Activities on This Page
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {activities.length}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Current Page
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {currentPage} / {totalPages}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleFilter}
        className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 sm:flex-row"
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by user, resource, or description"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
        />

        <select
          value={action}
          onChange={(event) => setAction(event.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
        >
          <option value="">All actions</option>
          <option value="DATA_VIEWED">Viewed</option>
          <option value="DATA_CREATED">Created</option>
          <option value="DATA_UPDATED">Updated</option>
          <option value="DATA_DELETED">Deleted</option>
          <option value="DATA_IMPORTED">Imported</option>
          <option value="DATA_EXPORTED">Exported</option>
          <option value="API_ACCESS">API access</option>
        </select>

        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Apply Filters
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-300">
              <tr>
                <th className="px-5 py-4">User</th>
                <th className="px-5 py-4">Action</th>
                <th className="px-5 py-4">Description</th>
                <th className="px-5 py-4">Resource</th>
                <th className="px-5 py-4">IP Address</th>
                <th className="px-5 py-4">Date &amp; Time</th>
                <th className="px-5 py-4">Details</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                    Loading user activities...
                  </td>
                </tr>
              ) : activities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                    No user activities found.
                  </td>
                </tr>
              ) : (
                activities.map((activity, index) => (
                  <tr
                    key={activity._id || activity.id || index}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {getUserName(activity.user)}
                      </div>
                      {activity.user?.email && (
                        <div className="mt-1 text-xs text-gray-500">
                          {activity.user.email}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getActionStyle(activity.action)}`}
                      >
                        {activity.action || "API_ACCESS"}
                      </span>
                    </td>

                    <td className="max-w-sm px-5 py-4 text-gray-600 dark:text-gray-300">
                      {activity.description || "—"}
                    </td>

                    <td className="px-5 py-4">
                      <div className="text-gray-900 dark:text-white">
                        {activity.resource || "—"}
                      </div>
                      {activity.resourceId && (
                        <div className="mt-1 max-w-40 truncate text-xs text-gray-500">
                          ID: {String(activity.resourceId)}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                      {activity.ipAddress || "—"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-gray-600 dark:text-gray-300">
                      {formatDate(activity.createdAt)}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedActivity(activity)}
                        className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {activities.length ? (currentPage - 1) * pageSize + 1 : 0}
            {" "}to {Math.min((currentPage - 1) * pageSize + activities.length, total)}
            {" "}of {total.toLocaleString()} activities
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCurrentPage(1);
              }}
              className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>

            <button
              type="button"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((value) => value - 1)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-gray-700 dark:text-white"
            >
              Previous
            </button>

            <button
              type="button"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setCurrentPage((value) => value + 1)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-gray-700 dark:text-white"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedActivity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedActivity(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-details-title"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2
                id="activity-details-title"
                className="text-xl font-bold text-gray-900 dark:text-white"
              >
                Activity Details
              </h2>

              <button
                type="button"
                onClick={() => setSelectedActivity(null)}
                aria-label="Close activity details"
                className="rounded-lg px-3 py-1 text-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                ×
              </button>
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                ["User", getUserName(selectedActivity.user)],
                ["Email", selectedActivity.user?.email || "—"],
                ["Action", selectedActivity.action || "—"],
                ["Resource", selectedActivity.resource || "—"],
                ["Resource ID", selectedActivity.resourceId || "—"],
                ["IP Address", selectedActivity.ipAddress || "—"],
                ["Date & Time", formatDate(selectedActivity.createdAt)],
                ["HTTP Method", selectedActivity.metadata?.method || "—"],
                ["Request Path", selectedActivity.metadata?.path || "—"],
                ["Status Code", selectedActivity.metadata?.statusCode ?? "—"],
                ["User Agent", selectedActivity.userAgent || "—"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs font-semibold uppercase text-gray-500">
                    {label}
                  </dt>
                  <dd className="mt-1 break-words text-sm text-gray-900 dark:text-gray-100">
                    {String(value)}
                  </dd>
                </div>
              ))}

              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase text-gray-500">
                  Description
                </dt>
                <dd className="mt-1 break-words text-sm text-gray-900 dark:text-gray-100">
                  {selectedActivity.description || "—"}
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase text-gray-500">
                  Additional Metadata
                </dt>
                <dd className="mt-2 overflow-x-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                  <pre className="whitespace-pre-wrap break-words text-xs text-gray-700 dark:text-gray-200">
                    {JSON.stringify(selectedActivity.metadata || {}, null, 2)}
                  </pre>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
