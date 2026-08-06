import { useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { Toast } from './components/shared/Toast';
import { ThemeProvider } from './theme/ThemeContext';
import { useCirrusApp } from './state/useCirrusApp';
import { router } from './router';

function App() {
  const app = useCirrusApp();

  useEffect(() => {
    document.documentElement.dataset.theme = app.theme;
  }, [app.theme]);

  return (
    <ThemeProvider theme={app.theme} setTheme={app.setTheme}>
      {app.authChecked && <RouterProvider router={router} context={{ app }} />}
      {app.toast && <Toast message={app.toast.message} />}
    </ThemeProvider>
  );
}

export default App;
