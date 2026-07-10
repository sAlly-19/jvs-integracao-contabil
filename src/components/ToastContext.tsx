"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AppIcon, AppIconName } from "./design-system";

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  description?: string;
  duration?: number;
}

interface ToastContextType {
  toast: {
    success: (message: string, description?: string) => void;
    error: (message: string, description?: string) => void;
    warning: (message: string, description?: string) => void;
    info: (message: string, description?: string) => void;
  };
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toastData: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = {
      ...toastData,
      id,
      duration: toastData.duration ?? 4500,
    };

    setToasts((prev) => [...prev, newToast]);

    if (newToast.duration !== Infinity) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }
  }, [removeToast]);

  const toast = {
    success: useCallback((message: string, description?: string) => {
      addToast({ type: "success", message, description });
    }, [addToast]),
    error: useCallback((message: string, description?: string) => {
      addToast({ type: "error", message, description });
    }, [addToast]),
    warning: useCallback((message: string, description?: string) => {
      addToast({ type: "warning", message, description });
    }, [addToast]),
    info: useCallback((message: string, description?: string) => {
      addToast({ type: "info", message, description });
    }, [addToast]),
  };

  return (
    <ToastContext.Provider value={{ toast, addToast, removeToast }}>
      {children}
      
      {/* Toast Portal/Container */}
      <div 
        id="toast-container" 
        className="fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-3 px-4 sm:px-0"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => {
            let bgColor = "bg-white dark:bg-slate-900";
            let borderColor = "border-border";
            let iconColor = "text-muted-foreground";
            let iconName: AppIconName = "spark";

            if (t.type === "success") {
              bgColor = "bg-emerald-50 dark:bg-emerald-950/30";
              borderColor = "border-emerald-200/80 dark:border-emerald-900/40";
              iconColor = "text-emerald-600 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-900/50";
              iconName = "check";
            } else if (t.type === "error") {
              bgColor = "bg-rose-50 dark:bg-rose-950/30";
              borderColor = "border-rose-200/80 dark:border-rose-900/40";
              iconColor = "text-rose-600 dark:text-rose-400 bg-rose-100/60 dark:bg-rose-900/50";
              iconName = "alert";
            } else if (t.type === "warning") {
              bgColor = "bg-amber-50 dark:bg-amber-950/30";
              borderColor = "border-amber-200/80 dark:border-amber-900/40";
              iconColor = "text-amber-600 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-900/50";
              iconName = "alert";
            } else if (t.type === "info") {
              bgColor = "bg-sky-50 dark:bg-sky-950/30";
              borderColor = "border-sky-200/80 dark:border-sky-900/40";
              iconColor = "text-sky-600 dark:text-sky-400 bg-sky-100/60 dark:bg-sky-900/50";
              iconName = "file";
            }

            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 shadow-lg ${bgColor} ${borderColor}`}
              >
                <AppIcon className={`size-8 rounded-lg ${iconColor}`} name={iconName} />
                
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t.message}
                  </h4>
                  {t.description ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t.description}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => removeToast(t.id)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <AppIcon className="size-4" name="close" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
