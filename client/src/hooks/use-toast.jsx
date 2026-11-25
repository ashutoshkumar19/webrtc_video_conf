import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

const TOAST_LIMIT = 5;
const REMOVE_DELAY = 4000;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback(({ title, description, variant = 'default' }) => {
    const id = Math.random().toString(36).slice(2);
    const item = { id, title, description, variant };
    setToasts((prev) => [item, ...prev].slice(0, TOAST_LIMIT));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, REMOVE_DELAY);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto w-72 rounded-xl border bg-slate-900 p-4 shadow-2xl border-slate-700 animate-fade-in"
          >
            <div className="flex items-start gap-2">
              {t.variant === 'destructive' && (
                <span className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 flex-shrink-0 mt-0.5">
                  !{" "}
                </span>
              )}
              <div className="flex-1">
                {t.title && (
                  <p className="text-sm font-semibold text-slate-100">{t.title}</p>
                )}
                {t.description && (
                  <p className="text-xs text-slate-400 mt-0.5">{t.description}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
