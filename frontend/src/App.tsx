import { useEffect } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { AppShell } from './components/AppShell';
import { Toast } from './components/shared/Toast';
import { ThemeProvider } from './theme/ThemeContext';
import { useCirrusApp } from './state/useCirrusApp';

function App() {
  const app = useCirrusApp();

  useEffect(() => {
    document.documentElement.dataset.theme = app.theme;
  }, [app.theme]);

  return (
    <ThemeProvider theme={app.theme} setTheme={app.setTheme}>
      {app.authChecked &&
        (app.screen === 'login' ? (
          <LoginScreen theme={app.theme} setTheme={app.setTheme} onContinue={app.goToInventoryFromLogin} />
        ) : (
          <AppShell app={app} />
        ))}
      {app.toast && <Toast message={app.toast.message} />}
    </ThemeProvider>
  );
}

export default App;
