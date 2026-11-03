import { useCallback, useEffect, useState } from "react";
import DateRangeFilter from "./DateRangeFilter";
import { getLinkedinLogsApi, exportLinkedinLogsApi } from "../services/dataService";
import ChangeDiff from "./ChangeDiff";
export const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const PAGE_SIZE = 20;

// Full class strings (not built dynamically) so Tailwind keeps them in the build.
const STATUS_STYLES = {
  updated:
    "bg-green-100 text-green-800 ring-green-600/20 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-400/30",
  company_changed:
    "bg-blue-100 text-blue-800 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30",
  title_changed:
    "bg-indigo-100 text-indigo-800 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/30",
  disqualified:
    "bg-red-100 text-red-800 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/30",
  failed:
    "bg-rose-100 text-rose-800 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30",
  skipped:
    "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
};
const STATUS_FALLBACK =
  "bg-gray-100 text-gray-700 ring-gray-500/20 dark:bg-gray-500/15 dark:text-gray-300 dark:ring-gray-400/30";

const statusLabel = (s) =>
  String(s || "—")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

function StatusBadge({ status }) {
  const key = String(status || "").toLowerCase();
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        STATUS_STYLES[key] ?? STATUS_FALLBACK
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

export default function LinkedinLogPanel() {
  const [range, setRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const { from, to } = range;
  const invalid = Boolean(from && to && from > to);

  const load = useCallback(async () => {
    if (invalid) return;
    setLoading(true);
    setError("");
    try {
      setData(await getLinkedinLogsApi({ from, to, page, limit: PAGE_SIZE }));
    } catch {
      setError("Could not load the log.");
    } finally {
      setLoading(false);
    }
  }, [from, to, page, invalid]);

  useEffect(() => {
    load();
  }, [load]);

  const changeRange = (next) => {
    setRange({ from: next.from || "", to: next.to || "" });
    setPage(1);
  };

  const download = async () => {
    setDownloading(true);
    setError("");
    try {
      const blob = await exportLinkedinLogsApi({ from, to });
      const tag = from || to ? `${from || "start"}_to_${to || "today"}` : "all";
      saveBlob(blob, `linkedin-update-log-${tag}.xlsx`);
    } catch (err) {
      console.error("Log download failed:", err);
      setError(err?.response?.data?.message || err.message || "Log download failed.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <DateRangeFilter from={from} to={to} onChange={changeRange} />

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              LinkedIn update log
            </h2>
            <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              {data.total.toLocaleString()} entries
            </span>
          </div>

          <button
            type="button"
            onClick={download}
            disabled={downloading || invalid || data.total === 0}
            className="inline-flex items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? "Downloading..." : `Download log (${data.total.toLocaleString()})`}
          </button>
        </div>

        {invalid && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            "From" date must be before "To" date.
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Table */}
          <div className="w-full  overflow-y-auto overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <tr>
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Date &amp; time</th>
                <th className="px-3 py-2.5">Prospect</th>
                <th className="px-3 py-2.5">LinkedIn URL</th>
                <th className="px-3 py-2.5">Result</th>
                <th className="px-3 py-2.5">Changes</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 text-gray-800 dark:divide-gray-800 dark:text-gray-200">
              {data.rows.map((r, i) => (
                <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {new Date(r.createdAt).toLocaleString("en-IN")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium">{r.name}</td>
                  <td className="max-w-xs truncate px-3 py-2.5">
                    {r.linkedinUrl ? (
                      <a
                        href={r.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={r.linkedinUrl}
                        className="text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {r.linkedinUrl}
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  {/* <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{r.details}</td> */}
                  <td className="min-w-[320px] px-3 py-2.5 text-gray-600 dark:text-gray-300">
  {r.changes?.length ? (
    <ChangeDiff changes={r.changes} />
  ) : (
    r.details
  )}
</td>
                </tr>
              ))}

              {!loading && data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                    No log entries for this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {loading && (
            <div className="border-t border-gray-100 px-3 py-2 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              Loading...
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} of {data.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              ‹ Prev
            </button>
            <button
              type="button"
              disabled={page >= data.totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Next ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}