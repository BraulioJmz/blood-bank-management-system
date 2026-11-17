import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import App from './App.tsx';
import { queryClient } from './api/queryClient';
import { SesionProvider } from './auth/sesion';
import { InterruptorDatos } from './dev/InterruptorDatos';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SesionProvider>
          <App />
          {import.meta.env.DEV && <InterruptorDatos />}
        </SesionProvider>
      </BrowserRouter>
      {/* Un solo Toaster en la raíz (ask-sonner): dos Toaster duplican cada toast. */}
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  </StrictMode>,
);
