// Codificación RFC 2047 de cabeceras con caracteres no ASCII (asunto, nombre del remitente).
// denomailer lo hace mal por su cuenta: usa Q-encoding con espacios sin codificar y, si la palabra
// codificada pasa de 74 caracteres, mete un salto de línea en medio de la cabecera — el servidor
// da por terminadas las cabeceras ahí, From/To/Content-Type acaban dentro del cuerpo y Gmail manda
// el mensaje a spam (caso real: aviso "Visita agendada — Kepa Etxeburua García · ..." del
// 2026-09-21). Aquí se codifica en Base64 por trozos de ≤ 45 bytes (≤ 72 caracteres codificados,
// bajo el límite de 75 de la RFC) separados por espacio, y se inyecta vía un preprocesador de
// denomailer (ver enviarSmtp) porque pasarlo ya codificado a send() no sirve. Única copia
// (antes había 6 idénticas, una por función — auditoría 2026-10-01).
export function codificarCabeceraMime(texto: string): string {
  if (!/[^ -~]/.test(texto)) return texto; // nada fuera del ASCII imprimible: se deja tal cual
  const enc = new TextEncoder();
  const trozos: string[] = [];
  let actual = '';
  for (const ch of texto) {
    if (enc.encode(actual + ch).length > 45) {
      trozos.push(actual);
      actual = ch;
    } else {
      actual += ch;
    }
  }
  if (actual) trozos.push(actual);
  return trozos.map((t) => `=?UTF-8?B?${btoa(String.fromCharCode(...enc.encode(t)))}?=`).join(' ');
}
