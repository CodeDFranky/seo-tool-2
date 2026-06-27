import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BackendGate } from '@/components/BackendGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BackendGate>
      <App />
    </BackendGate>
  </StrictMode>,
)
