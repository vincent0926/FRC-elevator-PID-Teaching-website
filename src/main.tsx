import './app/langInit'
import './app/palette'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app/theme.css'
import App from './App.tsx'
import { StoreProvider } from './app/store.tsx'
import { ArmStoreProvider } from './pages/arm/armStore.tsx'
import { LangToggle } from './app/LangToggle.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangToggle />
    <StoreProvider>
      <ArmStoreProvider>
        <App />
      </ArmStoreProvider>
    </StoreProvider>
  </StrictMode>,
)
