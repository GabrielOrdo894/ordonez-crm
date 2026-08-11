import { useEffect, useState } from 'react';

export function useEsMobil(breakpointPx = 768) {
  const [esMobil, setEsMobil] = useState(() => window.innerWidth < breakpointPx);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const handler = () => setEsMobil(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpointPx]);

  return esMobil;
}
