import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  message: string;
  type?: 'success' | 'info' | 'warn' | 'error';
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const MAX_VISIBLE = 4;

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.slice(-MAX_VISIBLE).map((toast) => {
          const isSuccess = toast.type === 'success' || !toast.type;
          const isWarn = toast.type === 'warn';
          const isError = toast.type === 'error';

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className={`pointer-events-auto flex flex-col p-3 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-medium relative overflow-hidden min-w-[260px] ${
                isError
                  ? 'bg-red-950/90 border-red-500/40 text-red-200'
                  : isWarn
                  ? 'bg-amber-950/90 border-amber-500/40 text-amber-200'
                  : isSuccess
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                  : 'bg-sky-950/90 border-sky-500/40 text-sky-200'
              }`}
            >
              <div className="flex items-center justify-between w-full gap-3 pb-1">
                <div className="flex items-center gap-2">
                  {isError ? (
                    <XCircle size={16} className="text-red-400 shrink-0" />
                  ) : isWarn ? (
                    <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                  ) : isSuccess ? (
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  ) : (
                    <Info size={16} className="text-sky-400 shrink-0" />
                  )}
                  <span>{toast.message}</span>
                </div>
                <button
                  onClick={() => onDismiss(toast.id)}
                  className="p-1 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </div>

              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 3, ease: 'linear' }}
                className={`absolute bottom-0 left-0 h-[3px] rounded-r ${
                  isError
                    ? 'bg-red-400 shadow-[0_0_8px_#f87171]'
                    : isWarn
                    ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]'
                    : isSuccess
                    ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
                    : 'bg-sky-400 shadow-[0_0_8px_#0ea5e9]'
                }`}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
