import { useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { Toast } from './components/shared/Toast';
import { ThemeProvider } from './theme/ThemeContext';
import { useCirrusApp } from './state/useCirrusApp';
import { AppContext } from './state/AppContext';
import { router } from './router';

function App() {
  const app = useCirrusApp();

  useEffect(() => {
    document.documentElement.dataset.theme = app.theme;
  }, [app.theme]);

  return (
    <ThemeProvider theme={app.theme} setTheme={app.setTheme}>
      <AppContext.Provider value={app}>
        {app.authChecked && <RouterProvider router={router} context={{ app }} />}
      </AppContext.Provider>
      <Toast toast={app.toast} />
    </ThemeProvider>
  );
}

export default App;
