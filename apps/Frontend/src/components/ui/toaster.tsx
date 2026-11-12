import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "./toast";
import { dismissToast, useToasts } from "../../hooks/use-toast";

// Mounted once, at the app root (see App.tsx) — every toast() call
// anywhere in the app renders through this single instance.
export function Toaster() {
  const toasts = useToasts();

  return (
    <ToastProvider>
      {toasts.map((t) => (
        <Toast key={t.id} variant={t.variant} onOpenChange={(open) => !open && dismissToast(t.id)}>
          <div className="flex-1">
            <ToastTitle>{t.title}</ToastTitle>
            {t.description && <ToastDescription>{t.description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
