import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Toaster from "./Toaster";
import ConfirmModal from "./ConfirmModal";

const FeedbackContext = createContext(null);

const MAX_TOASTS = 4;
const DEFAULT_DURATION = { success: 4500, info: 4500, warning: 6000, error: 6000 };
let nextToastId = 0;

const messageOf = (err, fallback) =>
  typeof err === "string" ? err : err?.response?.data?.message || err?.message || fallback;

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null); // { options, busy }
  const timers = useRef(new Map());
  const dialogRef = useRef(null); // { options, resolve }

  /* ---------- Toasts ---------- */
  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type, message, duration) => {
      const id = ++nextToastId;
      const ms = duration ?? DEFAULT_DURATION[type];
      setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, type, message }]);
      if (ms > 0) timers.current.set(id, setTimeout(() => dismiss(id), ms));
      return id;
    },
    [dismiss],
  );

  const toast = useMemo(
    () => ({
      success: (message, duration) => push("success", message, duration),
      error: (message, duration) => push("error", message, duration),
      warning: (message, duration) => push("warning", message, duration),
      info: (message, duration) => push("info", message, duration),
      dismiss,
    }),
    [push, dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  /* ---------- Confirm modal ---------- */
  const closeDialog = useCallback((result) => {
    dialogRef.current?.resolve(result);
    dialogRef.current = null;
    setDialog(null);
  }, []);

  // confirm({ title, message, confirmLabel, variant, onConfirm? }) -> Promise<boolean>
  // If onConfirm (async) is given, the modal shows a busy state while it runs and
  // any error it throws is shown as an error toast.
  const confirm = useCallback(
    (options = {}) =>
      new Promise((resolve) => {
        dialogRef.current?.resolve(false); // replace an open dialog
        dialogRef.current = { options, resolve };
        setDialog({ options, busy: false });
      }),
    [],
  );

  const handleConfirm = async () => {
    const current = dialogRef.current;
    if (!current) return;

    if (!current.options.onConfirm) return closeDialog(true);

    setDialog((d) => (d ? { ...d, busy: true } : d));
    try {
      await current.options.onConfirm();
      closeDialog(true);
    } catch (err) {
      toast.error(messageOf(err, "Something went wrong."));
      closeDialog(false);
    }
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onClose={dismiss} />
      <ConfirmModal
        open={Boolean(dialog)}
        busy={dialog?.busy}
        title={dialog?.options.title}
        message={dialog?.options.message}
        confirmLabel={dialog?.options.confirmLabel}
        cancelLabel={dialog?.options.cancelLabel}
        busyLabel={dialog?.options.busyLabel}
        variant={dialog?.options.variant}
        onConfirm={handleConfirm}
        onCancel={() => closeDialog(false)}
      />
    </FeedbackContext.Provider>
  );
}

const useFeedback = () => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("Wrap your app in <FeedbackProvider>.");
  return ctx;
};

export const useToast = () => useFeedback().toast;
export const useConfirm = () => useFeedback().confirm;