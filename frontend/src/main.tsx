import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/context/AuthContext'
import { SessionThemeProvider } from '@/components/shared/ThemeProvider'
import { ErrorBoundary } from './ErrorBoundary'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <ErrorBoundary>
          <SessionThemeProvider>
            <App />
            <Toaster 
              position="bottom-right"
              toastOptions={{
                style: {
                  borderRadius: '8px',
                  fontSize: '14px',
                }
              }}
            />
          </SessionThemeProvider>
        </ErrorBoundary>
      </AuthProvider>
    </HashRouter>
  </StrictMode>
)
