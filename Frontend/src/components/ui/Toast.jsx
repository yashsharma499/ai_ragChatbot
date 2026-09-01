import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Icon from "./Icon";
import { ToastContext } from "./toast-context";

/**
 * Replaces the `alert()` calls and the silent `console.error`s that used to be
 * the only feedback for failed toggles, uploads and deletions.
 */

const VARIANTS = {
  success: {
    icon: "check",
    ring: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    iconBg: "bg-emerald-500/15 text-emerald-400",
  },
  error: {
    icon: "warning",
    ring: "border-rose-500/30",
    bg: "bg-rose-500/10",
    text: "text-rose-200",
    iconBg: "bg-rose-500/15 text-rose-400",
  },
  info: {
    icon: "info",
    ring: "border-indigo-500/30",
    bg: "bg-indigo-500/10",
    text: "text-indigo-200",
    iconBg: "bg-indigo-500/15 text-indigo-400",
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, { variant = "info", duration = 4500 } = {}) => {
      if (!message) return null;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current.slice(-3), { id, message, variant }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  // Clear pending timers if the provider unmounts mid-toast.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      toast: push,
      success: (message, options) => push(message, { ...options, variant: "success" }),
      error: (message, options) => push(message, { ...options, variant: "error" }),
      info: (message, options) => push(message, { ...options, variant: "info" }),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const style = VARIANTS[toast.variant] ?? VARIANTS.info;
          return (
            <div
              key={toast.id}
              role="status"
              aria-live="polite"
              className={`animate-slideUp pointer-events-auto flex items-start gap-3 rounded-xl border ${style.ring} ${style.bg} bg-slate-900/90 p-3 shadow-2xl backdrop-blur-xl`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg ${style.iconBg}`}
              >
                <Icon name={style.icon} className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>

              <p className={`flex-1 text-sm font-medium leading-snug ${style.text}`}>
                {toast.message}
              </p>

              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="flex-shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:text-white"
                aria-label="Dismiss notification"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
