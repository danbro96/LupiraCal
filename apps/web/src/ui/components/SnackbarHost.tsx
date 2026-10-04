import { createContext, useContext, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';

type Severity = 'error' | 'success' | 'info';

/** Same shape as the mobile toast's action, e.g. Undo. */
export interface SnackAction {
  label: string;
  onPress: () => void;
}

type Show = (message: string, severity?: Severity, action?: SnackAction) => void;

const SnackbarContext = createContext<Show>(() => {});

/** Transient mutation feedback (errors mostly); field-level validation stays inline next to its input. */
export function useSnackbar() {
  return useContext(SnackbarContext);
}

export function SnackbarHost({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ message: string; severity: Severity; action?: SnackAction; key: number } | null>(null);
  const show: Show = (message, severity = 'error', action) => {
    setCurrent({ message, severity, action, key: Date.now() });
  };

  return (
    <SnackbarContext.Provider value={show}>
      {children}
      <Snackbar
        key={current?.key}
        open={current != null}
        autoHideDuration={6000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setCurrent(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {current ? (
          <Alert
            severity={current.severity}
            variant="filled"
            onClose={() => setCurrent(null)}
            action={current.action && (
              <Button
                color="inherit"
                size="small"
                onClick={() => { current.action!.onPress(); setCurrent(null); }}
              >
                {current.action.label}
              </Button>
            )}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </SnackbarContext.Provider>
  );
}
