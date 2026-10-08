import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
})

async function startApp() {
  const { worker } = await import('./mocks/browser')
  try {
    await worker.start({ serviceWorker: { url: '/mockServiceWorker.js' }, onUnhandledFrame: 'bypass', quiet: true })
  } catch {
    // Keep the game and options usable if service workers are unavailable; failed API writes remain queued locally.
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
    </StrictMode>,
  )
}

void startApp()
