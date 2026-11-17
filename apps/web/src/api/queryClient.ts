import { QueryClient } from '@tanstack/react-query';
import { ErrorApi } from './cliente';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Errores de negocio o de permisos (4xx) no se reintentan: repetirlos no los arregla.
      retry: (n, e) => !(e instanceof ErrorApi && e.status < 500) && n < 2,
    },
    mutations: { retry: false },
  },
});
