// Service worker mínimo del CRM (2026-09-25) — solo para que la app instalada en el móvil abra y
// muestre la pantalla de acciones rápidas aunque no haya cobertura en una obra.
//   · Navegaciones (HTML): red primero; si falla, la última copia del index.html cacheada.
//   · /crm/assets/ e /crm/icons/ (ficheros con hash en el nombre): caché primero, red si falta.
//   · Todo lo demás (Supabase, Google, otros orígenes): ni se toca ni se cachea.
// Los datos legales de la pantalla rápida se guardan aparte en localStorage (ver RapidoPage.tsx).
// Sin precache: el index.html se refresca en cada visita con red, y como los assets llevan hash
// un despliegue nuevo nunca sirve un chunk viejo como si fuera el actual.
const CACHE = 'crm-shell-v1';
const SHELL = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const peticion = event.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  if (peticion.mode === 'navigate') {
    event.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(SHELL, copia));
          }
          return respuesta;
        })
        .catch(() => caches.match(SHELL).then((hit) => hit || Response.error())),
    );
    return;
  }

  const scopePath = new URL(self.registration.scope).pathname;
  if (url.pathname.startsWith(`${scopePath}assets/`) || url.pathname.startsWith(`${scopePath}icons/`)) {
    event.respondWith(
      caches.match(peticion).then(
        (hit) =>
          hit ||
          fetch(peticion).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone();
              caches.open(CACHE).then((cache) => cache.put(peticion, copia));
            }
            return respuesta;
          }),
      ),
    );
  }
});
