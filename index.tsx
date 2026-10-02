import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { I18nProvider } from './hooks/useI18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
