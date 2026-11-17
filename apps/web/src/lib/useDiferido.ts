import { useEffect, useState } from 'react';

/** Valor que se actualiza después de `ms` sin cambios (búsqueda mientras se escribe). */
export function useDiferido<T>(valor: T, ms = 300) {
  const [diferido, setDiferido] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDiferido(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return diferido;
}
