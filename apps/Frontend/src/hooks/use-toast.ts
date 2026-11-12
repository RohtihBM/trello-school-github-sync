import { useSyncExternalStore } from "react";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

// A tiny module-level store, not React context — lets any code anywhere
// (including a plain async function deep in a page, not just a
// component) call toast() without needing to be inside a provider's
// component tree. useSyncExternalStore is what keeps every subscribed
// component correctly in sync with this external state.
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function toast(item: Omit<ToastItem, "id">) {
  const id = crypto.randomUUID();
  toasts = [...toasts, { ...item, id }];
  emit();
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
  );
}
