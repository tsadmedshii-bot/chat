import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initInstallPrompt } from './installPrompt';
import './styles.css';

// «Апп суулгах» саналыг эрт барьж авна.
initInstallPrompt();

// Service worker зөвхөн production build-д (Vite dev серверт бүртгэхгүй).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker бүртгэгдээгүй — апп сүлжээгээр ажиллана.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
