"use client";

import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

export type ToastVariant = "default" | "success" | "warning" | "error";

export type ToastOptions = {
  id?: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

export type ToastContextValue = {
  push(options: ToastOptions): string;
  dismiss(id: string): void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

type ToastRecord = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
};

const DEFAULT_DURATION = 6000;

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (options: ToastOptions) => {
      const id = options.id ?? createId();
      const duration = options.duration ?? DEFAULT_DURATION;
      setToasts((prev) => {
        const filtered = prev.filter((toast) => toast.id !== id);
        return [
          ...filtered,
          {
            id,
            title: options.title,
            description: options.description,
            variant: options.variant ?? "default",
            duration,
          },
        ];
      });
      const existingTimer = timers.current.get(id);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      timers.current.set(
        id,
        window.setTimeout(() => {
          dismiss(id);
        }, duration),
      );
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [dismiss, push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:inset-auto sm:bottom-4 sm:left-auto sm:right-4 sm:w-96 sm:justify-end">
        <div className="flex w-full flex-col gap-3">
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

type ToastCardProps = {
  toast: ToastRecord;
  onDismiss(id: string): void;
};

function ToastCard({ toast, onDismiss }: ToastCardProps) {
  const variantClass = {
    default: "border-slate-200 bg-white text-slate-800",
    success: "border-emerald-300 bg-emerald-50 text-emerald-700",
    warning: "border-amber-300 bg-amber-50 text-amber-700",
    error: "border-rose-300 bg-rose-50 text-rose-700",
  }[toast.variant];

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        "pointer-events-auto flex flex-col gap-1 rounded-2xl border p-4 shadow-lg transition",
        variantClass,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.description ? <p className="text-sm opacity-80">{toast.description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="rounded-full border border-black/10 px-2 py-1 text-xs font-semibold text-black/60 hover:bg-black/5"
        >
          Close
        </button>
      </div>
    </div>
  );
}
