import { useCallback, useEffect, useState } from "react";
import {
  getLinkedinAutoUpdateStatusApi,
} from "../services/dataService";
import ChangeDiff from "./ChangeDiff";

const WORKING_STATES = new Set(["queued", "checking", "running"]);
const STATE_LABELS = {
  scheduled: "Scheduled",
  queued: "Queued",
  checking: "Checking records",
  running: "Updating profiles",
  done: "Completed",
  completed: "Check complete",
  stopped: "Stopped",
  failed: "Failed",
  skipped: "Skipped",
  disabled: "Disabled",
};

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      })
    : "Not run yet";

const formatDuration = (milliseconds) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
      seconds % 60,
  ).padStart(2, "0")}`;
};

export default function LinkedinAutoUpdateStatus({
  canRun,
  selectedProspects,
  linkedinUpdateBusy,
  onRunSelected,
}) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStatus(await getLinkedinAutoUpdateStatusApi());
      setError("");
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError.message ||
          "Could not load the LinkedIn scheduler status.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const working = WORKING_STATES.has(status?.state);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, working ? 3000 : 15000);
    return () => window.clearInterval(timer);
  }, [refresh, working]);

  const stateLabel = STATE_LABELS[status?.state] || "Unavailable";
  const queue = status?.queue || [];
  const results = status?.results || [];
  const finished = ["done", "stopped", "failed", "completed", "skipped"].includes(
    status?.state,
  );
  const elapsedStart = status?.lastRunAt
    ? new Date(status.lastRunAt).getTime()
    : null;
  const elapsedEnd = status?.lastFinishedAt
    ? new Date(status.lastFinishedAt).getTime()
    : Date.now();
  const elapsed = elapsedStart == null ? 0 : elapsedEnd - elapsedStart;
  const selectedCount = selectedProspects?.length || 0;
  const selectionTooLarge = selectedCount > 25;

  return (
    <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              LinkedIn auto-update scheduler
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                status?.enabled
                  ? working
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300"
                    : "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              }`}
              role="status"
            >
              {loading ? "Loading" : status?.enabled ? stateLabel : "Disabled"}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {status?.enabled
              ? `Daily at ${status.scheduleTime || "02:30"} ${status.timezone || "Asia/Kolkata"} · Up to ${status.prospectLimit || 25} prospects per day`
              : "Automatic LinkedIn updates are disabled."}
          </p>
          {status?.enabled && (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>Next run: {formatDate(status.nextRunAt)}</span>
              {status.oneTimeRunAt && (
                <span>One-time test: {formatDate(status.oneTimeRunAt)}</span>
              )}
              <span>Last check: {formatDate(status.lastRunAt)}</span>
              {Number.isFinite(status.remainingToday) && (
                <span>
                  Daily views: {status.usedToday}/{status.dailyLimit} used (
                  {status.remainingToday} remaining)
                </span>
              )}
              {working && status.total > 0 && (
                <span>
                  Progress: {status.processed}/{status.total}
                </span>
              )}
            </div>
          )}
          {status?.message && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {status.message}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Refresh status
          </button>
          {canRun && (
            <button
              type="button"
              onClick={onRunSelected}
              disabled={
                working ||
                linkedinUpdateBusy ||
                loading ||
                selectedCount === 0 ||
                selectionTooLarge
              }
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {linkedinUpdateBusy
                ? "LinkedIn update running..."
                : `Run Check Now${selectedCount ? ` (${selectedCount})` : ""}`}
            </button>
          )}
        </div>
      </div>

      {canRun && (
        <p
            className={`mt-2 text-xs ${
              selectionTooLarge
                ? "text-amber-700 dark:text-amber-300"
                : "text-gray-500 dark:text-gray-400"
            }`}
        >
            {selectionTooLarge
              ? "Select no more than 25 prospects."
              : selectedCount
                ? `${selectedCount} selected. These selected prospects will be processed now, regardless of their last update date.`
                : "Select 1–25 prospects in the grid to run an immediate LinkedIn update."}
        </p>
      )}

      {queue.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700 dark:text-gray-200">
            <strong>
              {status.jobId ? (
                <>
                  LinkedIn update: {status.processed || 0}/
                  {status.total || queue.length}
                  {status.state === "done" && " ✓ finished"}
                  {status.state === "stopped" && " (stopped)"}
                  {status.state === "failed" && " (failed)"}
                </>
              ) : (
                `Next batch: ${queue.length} prospect${queue.length === 1 ? "" : "s"} pending`
              )}
            </strong>
            {status.jobId && (
              <span>
                {finished ? "Total time" : "Elapsed"}:{" "}
                <strong>{formatDuration(elapsed)}</strong>
              </span>
            )}
          </div>

          {status.jobId && (
            <div className="mb-3 h-2 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full bg-teal-600 transition-all"
                style={{
                  width: `${status.total ? ((status.processed || 0) / status.total) * 100 : 0}%`,
                }}
              />
            </div>
          )}

          <div className="max-h-80 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="p-2">#</th>
                  <th className="p-2">Prospect</th>
                  <th className="p-2">Result</th>
                  <th className="p-2">Details</th>
                  <th className="p-2">Changes</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 dark:text-gray-200">
                {queue.map((item, index) => {
                  const result = results.find(
                    (entry) => String(entry.id) === String(item.id),
                  );
                  const isCurrent =
                    Boolean(status.jobId) &&
                    !result &&
                    !finished &&
                    (status.currentId
                      ? String(status.currentId) === String(item.id)
                      : index === results.length);
                  const resultLabel = result?.status
                    ? result.status
                        .replace(/_/g, " ")
                        .replace(/^\w/, (letter) => letter.toUpperCase())
                    : isCurrent
                      ? "Updating..."
                      : finished
                        ? "Not processed"
                        : "Pending";
                  const resultStyle = result
                    ? result.status === "failed" ||
                      result.status === "disqualified"
                      ? "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
                      : result.status === "skipped"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                        : "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"
                    : isCurrent
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
                  const details =
                    result?.summary ||
                    (typeof result?.detail === "string" ? result.detail : "");

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/70"
                    >
                      <td className="p-2">{index + 1}</td>
                      <td className="whitespace-nowrap p-2 font-medium">
                        {result?.name || item.name}
                      </td>
                      <td className="whitespace-nowrap p-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${resultStyle}`}
                        >
                          {resultLabel}
                        </span>
                      </td>
                      <td className="min-w-[180px] p-2">{details}</td>
                      <td className="min-w-[260px] p-2">
                        {result?.diff?.length ? (
                          <ChangeDiff
                            changes={result.diff}
                            reason={result.reason}
                          />
                        ) : (
                          details
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!finished && status.waiting > 0 && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {status.waiting} waiting
            </div>
          )}
        </div>
      )}

      {status?.enabled &&
        !status.jobId &&
        !working &&
        queue.length === 0 && (
          <p className="mt-3 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No eligible stale prospects are pending for the next batch.
          </p>
        )}

      {error && (
        <div
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          role="alert"
        >
          {error}
        </div>
      )}
    </section>
  );
}
