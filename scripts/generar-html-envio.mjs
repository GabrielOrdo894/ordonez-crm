// Genera una página HTML local (con botones reales de copiar) a partir del mismo
// JSON que usa generar-pdf-envio.mjs. Pensada para abrir en el navegador justo
// antes de enviar el email — no se publica, es un fichero local.
// Uso: node scripts/generar-html-envio.mjs entrada.json salida.html
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Uso: node scripts/generar-html-envio.mjs entrada.json salida.html');
  process.exit(1);
}

const d = JSON.parse(readFileSync(inputPath, 'utf-8'));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cuerpoHtml = d.cuerpo.split('\n\n').map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
const avisosHtml = (d.avisos || []).map((a) => `<div class="aviso ${a.startsWith('CORRECCIÓN') ? 'verde' : 'ambar'}">${esc(a)}</div>`).join('\n');
const paraTexto = d.clienteEmail ? `${d.cliente} <${d.clienteEmail}>` : d.cliente;
const textoCompleto = `Asunto: ${d.asunto}\n\n${d.cuerpo}`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Envío ${esc(d.numero)} — ${esc(d.cliente)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; background: #f4f4f2; margin: 0; padding: 24px; color: #111827; }
  .page { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
  .cabecera { background: #0f3d24; color: #fff; padding: 18px 24px; }
  .cabecera .marca { font-size: 12px; font-weight: bold; letter-spacing: 0.04em; opacity: 0.85; }
  .cabecera h1 { font-size: 18px; margin: 6px 0 2px; }
  .cabecera .meta { font-size: 12px; opacity: 0.85; }
  .contenido { padding: 20px 24px; }
  .campo { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid #eaf2ed; align-items: center; }
  .campo:last-child { border-bottom: none; }
  .campo .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #4b5563; width: 70px; flex-shrink: 0; }
  .campo .valor { font-size: 13.5px; flex: 1; }
  .campo .valor.asunto { font-weight: bold; }
  .botones { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  button { font-family: inherit; font-size: 13px; padding: 8px 14px; border-radius: 6px; border: 1px solid #1a5c38; background: #1a5c38; color: #fff; cursor: pointer; }
  button.secundario { background: #fff; color: #1a5c38; }
  button:active { transform: translateY(1px); }
  button.copiado { background: #16653480; }
  .cuerpo { margin-top: 18px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 18px; font-size: 13.5px; line-height: 1.6; background: #fcfcfb; }
  .cuerpo p { margin: 0 0 12px; white-space: pre-wrap; }
  .cuerpo p:last-child { margin-bottom: 0; }
  .adjunto { margin-top: 12px; font-size: 12.5px; color: #4b5563; font-style: italic; }
  .aviso { margin-top: 10px; padding: 10px 12px; border-radius: 6px; font-size: 12px; border: 1px solid; }
  .aviso.ambar { background: #feedc8; border-color: #92400e; color: #92400e; }
  .aviso.verde { background: #dcf5e1; border-color: #166534; color: #166534; }
  .pie { padding: 12px 24px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
</style>
</head>
<body>
  <div class="page">
    <div class="cabecera">
      <div class="marca">REFORMAS ORDOÑEZ · PROPUESTA DE ENVÍO</div>
      <h1>${esc(d.numero)} — ${esc(d.cliente)}</h1>
      <div class="meta">Idioma: ${esc(d.idioma)} · Canal: ${esc(d.canal)} · Estado: ${esc(d.estado)}</div>
    </div>
    <div class="contenido">
      <div class="campo">
        <div class="label">Para</div>
        <div class="valor" id="valor-email">${esc(paraTexto)}</div>
      </div>
      <div class="campo">
        <div class="label">Asunto</div>
        <div class="valor asunto">${esc(d.asunto)}</div>
      </div>

      <div class="botones">
        <button id="btn-texto" onclick="copiar('texto', this)">Copiar asunto + cuerpo</button>
        <button id="btn-email" class="secundario" onclick="copiar('email', this)">Copiar email del cliente</button>
      </div>

      <div class="cuerpo">
        ${cuerpoHtml}
      </div>

      <div class="adjunto">📎 Adjunto: ${esc(d.adjunto)}</div>

      ${avisosHtml}
    </div>
    <div class="pie">Presupuesto ${esc(d.numero)} · borrador de mensaje, no enviado · fuentes: ${esc(d.fuentes || '—')}</div>
  </div>

<script>
  const TEXTO_COMPLETO = ${JSON.stringify(textoCompleto)};
  const EMAIL = ${JSON.stringify(d.clienteEmail || '')};

  function copiarAlPortapapeles(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    return Promise.resolve();
  }

  function copiar(tipo, boton) {
    const texto = tipo === 'texto' ? TEXTO_COMPLETO : EMAIL;
    copiarAlPortapapeles(texto).then(() => {
      const original = boton.textContent;
      boton.textContent = 'Copiado ✓';
      boton.classList.add('copiado');
      setTimeout(() => { boton.textContent = original; boton.classList.remove('copiado'); }, 1500);
    });
  }
</script>
</body>
</html>
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, html, 'utf-8');
console.log('HTML generado:', outputPath);
