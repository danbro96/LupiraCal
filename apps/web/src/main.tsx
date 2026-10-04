import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { router } from './ui/navigation/router';
import { SnackbarHost } from '@danbro96/lupira-web-mui/SnackbarHost';
import { theme } from './ui/theme/muiTheme';
import { ApiError } from '@danbro96/lupira-http/apiError';
import { installCookieTransport } from '@danbro96/lupira-web-session/cookieTransport';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx (e.g. a 404 on a synthetic birthday id) never succeeds on retry — surface it at once
      // instead of leaving the UI spinning; keep the default backoff for transient 5xx/network errors.
      retry: (failureCount, error) =>
        error instanceof ApiError && error.status >= 400 && error.status < 500 ? false : failureCount < 3,
    },
  },
});

// Before anything can issue a request: the generated clients call through this.
installCookieTransport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <SnackbarHost>
          <RouterProvider router={router} />
        </SnackbarHost>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
