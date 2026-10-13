'use client';

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import Link from 'next/link';

type ToastType = 'success' | 'error' | 'info';

/** A link shown in the toast — e.g. "not enough credits" → the Abonnement page. */
export interface ToastAction {
  label: string;
  href: string;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
  action?: ToastAction;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  toast: () => {},
});

const TOAST_DURATION = 3000;
const FADE_OUT_DURATION = 300;
// Long enough to read the message and reach its button.
const ACTION_TOAST_DURATION = 7000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const addToast = useCallback(
    (message: string, type: ToastType = 'success', action?: ToastAction) => {
      const id = nextIdRef.current++;
      const duration = action ? ACTION_TOAST_DURATION : TOAST_DURATION;
      setToasts((prev) => [...prev, { id, message, type, ...(action ? { action } : {}) }]);
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      }, duration);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration + FADE_OUT_DURATION);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toasts, toast: addToast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed top-0 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pt-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-medium shadow-lg transition-opacity ${
              t.exiting ? 'opacity-0' : 'opacity-100'
            } ${
              t.type === 'success'
                ? 'border-green-200 bg-white text-green-700'
                : t.type === 'error'
                  ? 'border-red-200 bg-white text-red-700'
                  : 'border-gray-200 bg-white text-gray-700'
            }`}
            style={{ maxWidth: '90vw' }}
          >
            <span>{t.message}</span>
            {t.action ? (
              <Link
                href={t.action.href}
                className="flex-shrink-0 rounded-lg bg-[#EEF1FF] px-3 py-1.5 text-[12.5px] font-semibold text-[#1E36D6] transition-colors hover:bg-[#E2E7FF]"
              >
                {t.action.label}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
