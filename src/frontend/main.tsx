import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PasswordProvider } from './contexts/PasswordContext'

// Detect platform for CSS styling
if (navigator.userAgent.includes('Mac')) {
  document.documentElement.setAttribute('data-platform', 'macos')
} else if (navigator.userAgent.includes('Windows')) {
  document.documentElement.setAttribute('data-platform', 'windows')
} else if (navigator.userAgent.includes('Linux')) {
  document.documentElement.setAttribute('data-platform', 'linux')
}

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('Service Worker registered:', registration.scope);
      },
      (error) => {
        console.error('Service Worker registration failed:', error);
      }
    );
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PasswordProvider>
      <App />
    </PasswordProvider>
  </StrictMode>,
)
