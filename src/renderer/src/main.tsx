import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'

// Outer net: if the shell itself throws, the inner per-page boundary is gone
// with it, so this one keeps the window from going blank.
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary fatal>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
