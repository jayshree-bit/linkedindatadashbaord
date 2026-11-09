import { createPortal } from "react-dom";

const ACCENT = {
  success: "border-green-600",
  error: "border-red-600",
  warning: "border-amber-500",
  info: "border-blue-600",
};

export default function Toaster({ toasts, onClose }) {
  if (!toasts.length) return null;

  return createPortal(
    <div
      role="region"
      aria-live="polite"
      className="fixed right-4 top-4 z-[10000] flex max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={`flex items-start gap-3 rounded-md border-l-4 bg-white px-3 py-2.5
            text-sm leading-snug text-gray-900 shadow-lg
            dark:bg-gray-800 dark:text-gray-100 ${ACCENT[t.type] ?? ACCENT.info}`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onClose(t.id)}
            className="text-lg leading-none text-gray-500 hover:text-gray-700
              dark:text-gray-400 dark:hover:text-gray-200"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}