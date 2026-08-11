# Documenso — firma electrónica de presupuestos

## Qué hace

En el constructor de presupuestos (`PresupuestoForm.tsx`), sección "Firma", además de la firma manual
por canvas existe el botón "Enviar a firmar con Documenso": genera el PDF del presupuesto, lo sube a
Documenso, crea un firmante (el email del cliente) y devuelve un enlace de firma
(`https://app.documenso.com/sign/...`) que se copia y se envía al cliente por el canal que se prefiera
(WhatsApp, email, etc. — Documenso no se usa para enviar el email automático).

Cuando el cliente firma en ese enlace, un webhook de Documenso llama a la Edge Function
`documenso-webhook`, que marca el presupuesto como `firmado = true` y `estado = 'Aceptado'`
automáticamente (mismo comportamiento que la firma manual).

## Piezas

- Migración `supabase/migrations/20260725000002_documenso_presupuestos.sql` — columnas
  `firma_metodo`, `documenso_envelope_id`, `documenso_signing_url`, `documenso_estado` en `presupuestos`.
- `src/lib/generarPdfPresupuesto.ts` → `generarPdfPresupuestoBlob(p)` — genera el PDF como `Blob` en
  vez de descargarlo, para poder subirlo.
- `src/lib/documenso.ts` → `enviarPresupuestoAFirmar(p)` — genera el PDF, lo pasa a base64 e invoca la
  Edge Function `documenso-crear-envelope`.
- Edge Function `supabase/functions/documenso-crear-envelope` — recibe el PDF en base64 + datos del
  cliente, crea el documento en Documenso, añade al cliente como firmante, lo envía y guarda
  `documenso_envelope_id` / `documenso_signing_url` en el presupuesto.
- Edge Function `supabase/functions/documenso-webhook` — recibe los eventos de Documenso (documento
  firmado) y actualiza el presupuesto correspondiente.

## 1. Generar la API key de Documenso

1. Entra en tu cuenta de Documenso: https://app.documenso.com
2. Ve a **Configuración → API Tokens** (o **Settings → API Tokens**, según el idioma de la interfaz).
3. Crea un nuevo token, dale un nombre (p. ej. `crm-ordonez`) y cópialo — solo se muestra una vez.

## 2. Instalar la Supabase CLI (paso a paso)

Si ya tienes Node.js instalado (lo necesitas de todas formas para este proyecto), la forma más
simple en Windows es con npm:
```powershell
npm install -g supabase
```

Alternativa con [Scoop](https://scoop.sh/):
```powershell
irm get.scoop.sh | iex
scoop install supabase
```
O descarga el `.exe` directamente desde https://github.com/supabase/cli/releases (busca
`supabase_windows_amd64.tar.gz`) y añade la carpeta al PATH.

Verifica que se instaló:
```powershell
supabase --version
```

## 3. Conectar la CLI a tu proyecto

Desde la carpeta del proyecto (`ordonez-crm`):
```powershell
supabase login
```
Esto abre el navegador para iniciar sesión con tu cuenta de Supabase. Una vez logueado, vuelve a la
terminal.

```powershell
supabase link --project-ref <PROJECT_REF>
```
`<PROJECT_REF>` es el identificador del proyecto — lo encuentras en la URL del dashboard de Supabase:
`https://supabase.com/dashboard/project/<PROJECT_REF>`, o en Settings → General → "Reference ID".

## 4. Configurar los secretos

```powershell
supabase secrets set DOCUMENSO_API_KEY=<tu api key de Documenso> DOCUMENSO_WEBHOOK_SECRET=<ver paso 6>
```
(El paso 6 explica de dónde sale `DOCUMENSO_WEBHOOK_SECRET` — puedes volver a ejecutar este comando
para actualizarlo cuando lo tengas.)

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente en cada función, no
hace falta configurarlos.

## 5. Desplegar las Edge Functions

```powershell
supabase functions deploy documenso-crear-envelope
supabase functions deploy documenso-webhook --no-verify-jwt
```
`--no-verify-jwt` es necesario en `documenso-webhook` porque la petición llega directamente desde los
servidores de Documenso, sin la cabecera de autenticación de Supabase (igual que
`google-oauth-callback`, ver `docs/google-apis.md`).

## 6. Registrar el webhook en Documenso

1. Antes de entrar en Documenso, inventa un secreto propio (una cadena larga y aleatoria). En
   PowerShell puedes generarlo así:
   ```powershell
   -join ((48..57)+(97..122)|Get-Random -Count 40|%{[char]$_})
   ```
2. En Documenso, ve a **Configuración → Webhooks** (o **Settings → Webhooks**).
3. Crea un webhook nuevo con la URL:
   ```
   https://<PROJECT_REF>.supabase.co/functions/v1/documenso-webhook
   ```
4. Activa (al menos) el evento de documento completado/firmado (`Document Completed`).
5. En el campo de secreto del webhook, pega el secreto que inventaste en el paso 1.
6. Ejecuta de nuevo el comando del paso 4 con ese mismo valor:
   `DOCUMENSO_WEBHOOK_SECRET=<el secreto que inventaste>`.

## 7. Ejecutar la migración SQL

En el SQL Editor del dashboard de Supabase, pega y ejecuta el contenido de
`supabase/migrations/20260725000002_documenso_presupuestos.sql`.

## Verificación

1. Abre un presupuesto normal (no orientativo) ya guardado, con email de cliente relleno.
2. Sección "Firma" → "Enviar a firmar con Documenso" → debe aparecer un enlace `https://app.documenso.com/sign/...`.
3. Abre ese enlace (puedes simularlo tú mismo) y firma el documento.
4. El presupuesto en el CRM debe pasar a `Aceptado` y `firmado = true` en segundos (sin recargar
   manualmente basta con reabrir el presupuesto).
