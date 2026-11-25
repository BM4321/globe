"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";

type Tone = "success" | "warning" | "error";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  text?: string;
}

interface ToastApi {
  success: (title: string, text?: string) => void;
  warning: (title: string, text?: string) => void;
  error: (title: string, text?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (tone: Tone, title: string, text?: string) => {
      const id = next.current++;
      setToasts((t) => [{ id, tone, title, text }, ...t].slice(0, 3));
      if (tone !== "error") window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, x) => show("success", t, x),
      warning: (t, x) => show("warning", t, x),
      error: (t, x) => show("error", t, x),
    }),
    [show],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-[72px] z-[80] flex flex-col gap-3" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`gt-toast gt-toast--${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
            <span className="gt-toast__icon">
              {t.tone === "success" ? <Check size={15} strokeWidth={2} /> : <AlertTriangle size={14} strokeWidth={2} />}
            </span>
            <span>
              <span className="block font-semibold">{t.title}</span>
              {t.text && <span className="block text-[13px] leading-[19px] text-ink-muted">{t.text}</span>}
            </span>
            <button className="rounded-sm p-0.5 text-ink-muted hover:text-ink" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const t = useContext(Ctx);
  if (!t) throw new Error("useToast must be used inside ToastProvider");
  return t;
}
