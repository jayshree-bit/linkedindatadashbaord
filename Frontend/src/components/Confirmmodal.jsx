import { useEffect } from "react";
import { createPortal } from "react-dom";

const CONFIRM_STYLE = {
  danger: "bg-red-600 hover:bg-red-700 focus:ring-red-400",
  primary: "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-400",
};

export default function ConfirmModal({
  open,
  title = "Are you sure?",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busyLabel = "Please wait...",
  variant = "danger", // "danger" | "primary"
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={() => !busy && onCancel()}
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-gray-900/55 p-4 backdrop-blur-[2px]"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 text-gray-900 shadow-2xl
          dark:bg-gray-800 dark:text-gray-100"
      >
        <h3 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h3>

        {message && (
          <p
            id="confirm-message"
            className="mb-5 mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300"
          >
            {message}
          </p>
        )}

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium
              text-gray-800 hover:bg-gray-50 disabled:opacity-60
              dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white focus:outline-none
              focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70
              ${CONFIRM_STYLE[variant] ?? CONFIRM_STYLE.danger}`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}