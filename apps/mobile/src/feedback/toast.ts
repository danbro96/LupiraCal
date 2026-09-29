import { create } from 'zustand';
import { hapticError } from './haptics';

// The imperative half of the toast feature: a leaf with no app-layer dependencies, so any layer
// may call `toast()` without reaching upward into the UI. The host is ui/components/ToastHost.tsx.
// One message at a time; a new toast replaces the current one.

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  durationMs?: number;
}

export interface ToastState {
  message: string | null;
  action: ToastAction | null;
  durationMs: number;
  nonce: number; // re-arms the auto-dismiss timer even for identical text
  /** Height of the focused screen's pinned bottom bar, 0 when it has none; the host lifts toasts above it. */
  clearance: number;
  show: (message: string, opts?: ToastOptions) => void;
  hide: () => void;
  setClearance: (px: number) => void;
}

export const DEFAULT_DISMISS_MS = 3500;

export const useToast = create<ToastState>(set => ({
  message: null,
  action: null,
  durationMs: DEFAULT_DISMISS_MS,
  nonce: 0,
  clearance: 0,
  show: (message, opts) =>
    set(s => ({
      message,
      action: opts?.action ?? null,
      durationMs: opts?.durationMs ?? DEFAULT_DISMISS_MS,
      nonce: s.nonce + 1,
    })),
  hide: () => set({ message: null, action: null }),
  setClearance: px => set({ clearance: px }),
}));

/** Safe to call outside React components. `action` renders an inline button (e.g. Undo). */
export function toast(message: string, opts?: ToastOptions): void {
  useToast.getState().show(message, opts);
}

/** toast() plus an error haptic. */
export function toastError(message: string): void {
  hapticError();
  toast(message);
}
