# Google APIs — referencia

## Setup (Bloque 2)
Loader moderno (bootstrap async) en `index.html`, key desde `VITE_GMAPS_API_KEY` vía `%VITE_GMAPS_API_KEY%`.
Google Identity Services cargado aparte para el OAuth de Calendar:
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

## Google Maps — MapsAutocomplete.tsx (Places API New)
Usa el web component `PlaceAutocompleteElement`, no el widget legacy `google.maps.places.Autocomplete`.
```typescript
const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
const elemento = new PlaceAutocompleteElement({ includedRegionCodes: ['es', 'fr'] });
contenedor.appendChild(elemento);

elemento.addEventListener('gmp-select', async ({ placePrediction }) => {
  const place = placePrediction.toPlace();
  await place.fetchFields({ fields: ['formattedAddress', 'addressComponents', 'location'] });
  const country = place.addressComponents?.find(c => c.types.includes('country'))?.shortText;

  onSelect({
    direccion: place.formattedAddress ?? '',
    lat: place.location?.lat() ?? null,
    lng: place.location?.lng() ?? null,
    pais: country === 'ES' ? 'España' : country === 'FR' ? 'Francia' : ''
  });
});
```
Fallback si no carga Maps (key inválida, sin red): input de texto normal, sin error visible.

## Google Calendar — estructura del evento al guardar visita
```typescript
const evento = {
  summary: `Visita Tecnica - ${tipo}`,
  location: direccion,
  description: [
    'CLIENTE',
    `Nombre: ${nombre} ${apellidos}`,
    `Tel: ${telefono}`,
    `Email: ${email || 'No indicado'}`,
    `Idioma: ${idioma || 'No indicado'}`,
    `Dirección: ${direccion}`,
    `Zona: ${zona} · ${pais}`,
    '',
    'TRABAJO',
    `Tipo: ${tipo}`,
    `Descripción: ${descripcion || 'Sin descripción'}`,
    '',
    `Asignado: ${empleado}`
  ].join('\n'),
  start: { dateTime: `${fecha}T${hora}:00`, timeZone: 'Europe/Paris' },
  end:   { dateTime: `${fecha}T${horaFin}:00`, timeZone: 'Europe/Paris' },
  colorId: estado === 'Confirmada' ? '10' : estado === 'Cancelada' ? '8' : '5'
};
```

## CalendarPicker — disponibilidad
Consultar eventos del mes actual y el siguiente.
Colores de días:
- Sin eventos → fondo blanco
- 1–2 eventos → `bg-amber-50 border-amber-300`
- 3+ eventos → `bg-red-50 border-red-300`
- Seleccionado → `bg-brand-light border-brand`

## Autorización persistente de Google Calendar (refresh_token compartido)
Antes se usaba Google Identity Services (`initTokenClient`) con el access_token guardado en
`localStorage` — caducaba a los 60 minutos y pedía volver a iniciar sesión constantemente a
los 3 usuarios. Sustituido por un flujo de código de autorización con `refresh_token`
persistente en Supabase, compartido por los 3 usuarios (ver
`modificaciones/reparación de inicio de sesion de google.txt`).

**Piezas:**
- Tabla `google_config` (fila única, `id = 1`) — guarda el `refresh_token`. Ver `docs/supabase-schema.md`.
- Edge Function `supabase/functions/google-oauth-callback` — recibe el `code` del consentimiento
  de Google, lo intercambia por tokens (`access_type=offline&prompt=consent` es obligatorio para
  que Google entregue `refresh_token`) y lo guarda en `google_config`.
- Edge Function `supabase/functions/google-token` — dado el `refresh_token` guardado, pide a
  Google un `access_token` nuevo y lo devuelve al frontend. Se invoca en cada operación de
  Calendar (`src/lib/googleCalendar.ts` → `obtenerAccessToken()`), con caché en memoria durante
  su tiempo de vida (~1h).
- `iniciarConexionGoogleCalendar()` en `src/lib/googleCalendar.ts` — redirige a la pantalla de
  consentimiento de Google. Solo hace falta ejecutarlo **una vez** (acción de administrador,
  botón en Configuración → Google Calendar); a partir de ahí los 3 usuarios comparten el mismo
  calendario sin volver a loguearse.

**Bloque 6 (Solicitudes & Seguimiento) — Gmail se conecta por separado desde el 2026-08-05.**
Entre el 2026-07-28 y esa fecha, Calendar y Gmail (`gmail.readonly` + `gmail.send`) compartían un
único `refresh_token` combinado — el `access_token` que el navegador recibe para Calendar
(`google-token`) también servía entonces para leer/enviar Gmail, mucho más privilegio del que ese
uso necesita (auditoría de seguridad 2026-08-05). Desde entonces:

- `iniciarConexionGoogleCalendar()` pide solo `calendar.events` → guarda en `google_config.refresh_token`.
- `iniciarConexionGmail()` (botón nuevo "Conectar Gmail" en Configuración) pide `gmail.readonly` +
  `gmail.send` → guarda en `google_config.refresh_token_gmail`.
- `google-token` (la única función que expone el token al navegador) sigue usando `refresh_token`
  — ahora con scope reducido, sin Gmail.
- `revisar-gmail` y `notificar-visita` (server-side, nunca exponen el token) usan
  `refresh_token_gmail`, con fallback al `refresh_token` combinado antiguo mientras no se haya
  conectado Gmail por separado — no se rompe nada hasta que un administrador pulse el botón nuevo.

Para cerrar del todo el exceso de permiso: en Configuración → Google Calendar y Gmail, pulsar
"Conectar Gmail" (una vez) y después "Reconectar" en Calendar (para que ese token deje de llevar
también scope de Gmail). Si algún scope no aparece disponible en la pantalla de consentimiento,
comprobar en Google Cloud Console → OAuth consent screen que esté en la lista de scopes del proyecto.

**Variables de entorno de las Edge Functions** (`supabase secrets set ...`, NO en `.env` del
frontend porque incluyen el client secret):
```
GOOGLE_CLIENT_ID=<mismo valor que VITE_GCAL_CLIENT_ID>
GOOGLE_CLIENT_SECRET=<Client secret del OAuth Client en Google Cloud Console>
```
`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente en cada función.

**Google Cloud Console:** en el OAuth Client (tipo "Aplicación web") usado para `VITE_GCAL_CLIENT_ID`,
añadir en "URIs de redirección autorizados":
```
https://<PROJECT_REF>.supabase.co/functions/v1/google-oauth-callback
```

**Despliegue:**
```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
supabase functions deploy google-oauth-callback --no-verify-jwt
supabase functions deploy google-token
```
`--no-verify-jwt` es necesario en `google-oauth-callback` porque la llamada llega como redirect
del navegador desde `accounts.google.com`, sin cabecera de autenticación de Supabase.
`google-token` sí se invoca autenticado (vía `supabase.functions.invoke`) y mantiene la
verificación por defecto.
