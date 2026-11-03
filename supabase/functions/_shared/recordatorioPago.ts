// Recordatorios automáticos de facturas vencidas (2026-11-03, decisión de Gabriel): tres pasos a +3,
// +10 y +20 días del vencimiento, en el idioma de la factura. Sin imports a propósito: lo usa la Edge
// Function recordatorio-pago-automatico (Deno) y lo cubre Vitest desde el repo.

export const DIAS_PASO = [3, 10, 20] as const;

/** Paso que corresponde a una factura con `diasVencida` días de retraso (0 si todavía ninguno). */
export function pasoQueToca(diasVencida: number): 0 | 1 | 2 | 3 {
  if (diasVencida >= DIAS_PASO[2]) return 3;
  if (diasVencida >= DIAS_PASO[1]) return 2;
  if (diasVencida >= DIAS_PASO[0]) return 1;
  return 0;
}

/** Paso a programar hoy, o 0: solo el que toca por fecha, nunca uno ya enviado o cancelado (ni
 * uno anterior a ellos), y nada si ya hay uno programado esperando su envío. */
export function pasoAProgramar(
  diasVencida: number,
  existentes: { paso: number; estado: string }[],
): number {
  if (existentes.some((e) => e.estado === 'programado')) return 0;
  const toca = pasoQueToca(diasVencida);
  const maxExistente = existentes.reduce((m, e) => Math.max(m, e.paso), 0);
  return toca > maxExistente ? toca : 0;
}

/** Total con IVA de las líneas de una factura (las incluidas sin coste no suman). */
export function totalLineas(
  lineas: { total_con_iva?: number | null; es_incluido?: boolean | null }[] | null,
): number {
  return (
    Math.round(
      (lineas ?? []).reduce((s, l) => s + (l.es_incluido ? 0 : Number(l.total_con_iva) || 0), 0) *
        100,
    ) / 100
  );
}

function euros(n: number, fr: boolean): string {
  const [entero, dec] = n.toFixed(2).split('.');
  return `${entero.replace(/\B(?=(\d{3})+(?!\d))/g, fr ? ' ' : '.')},${dec} €`;
}

function fecha(iso: string, fr: boolean): string {
  const [y, m, d] = iso.split('-');
  return fr ? `${d}/${m}/${y}` : `${d}/${m}/${y}`;
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type DatosRecordatorio = {
  paso: number;
  fr: boolean;
  nombreCliente: string;
  numero: string;
  pendiente: number;
  fechaVence: string;
  iban: string | null;
  bic: string | null;
  titular: string | null;
  telefono: string | null;
  emailContacto: string;
};

/** Asunto y cuerpo HTML del recordatorio. Paso 1 amable, 2 firme, 3 último aviso (sin mise en
 * demeure: esa la decide Gabriel a mano). */
export function construirRecordatorio(d: DatosRecordatorio): { asunto: string; html: string } {
  const nombre = escHtml(d.nombreCliente.trim().split(/\s+/)[0] || d.nombreCliente);
  const importe = euros(d.pendiente, d.fr);
  const vence = fecha(d.fechaVence, d.fr);
  const numero = escHtml(d.numero);
  const banco = d.iban
    ? d.fr
      ? `<p>Coordonnées bancaires pour le virement :<br>Titulaire : ${escHtml(d.titular ?? 'Reformas Ordoñez')}<br>IBAN : ${escHtml(d.iban)}${d.bic ? `<br>BIC : ${escHtml(d.bic)}` : ''}<br>Référence : ${numero}</p>`
      : `<p>Datos para la transferencia:<br>Titular: ${escHtml(d.titular ?? 'Reformas Ordoñez')}<br>IBAN: ${escHtml(d.iban)}${d.bic ? `<br>BIC: ${escHtml(d.bic)}` : ''}<br>Concepto: ${numero}</p>`
    : '';
  const contacto = d.fr
    ? `<p>Si vous avez déjà effectué le règlement, merci de ne pas tenir compte de ce message. Pour toute question, vous pouvez nous joindre${d.telefono ? ` au ${escHtml(d.telefono)} ou` : ''} à ${escHtml(d.emailContacto)}.</p>`
    : `<p>Si ya ha realizado el pago, por favor ignore este mensaje. Para cualquier consulta puede contactarnos${d.telefono ? ` en el ${escHtml(d.telefono)} o` : ''} en ${escHtml(d.emailContacto)}.</p>`;
  const firma = d.fr
    ? '<p>Cordialement,<br>Reformas Ordoñez</p>'
    : '<p>Un saludo,<br>Reformas Ordoñez</p>';
  const pie = d.fr
    ? `<p style="color:#9ca3af;font-size:11px">Courriel automatique — merci de ne pas répondre à cette adresse. Pour toute question : ${escHtml(d.emailContacto)}.</p>`
    : `<p style="color:#9ca3af;font-size:11px">Correo automático — no responder a esta dirección. Para cualquier consulta: ${escHtml(d.emailContacto)}.</p>`;

  let asunto: string;
  let cuerpo: string;
  if (d.fr) {
    if (d.paso === 1) {
      asunto = `Rappel de paiement — facture ${d.numero}`;
      cuerpo = `<p>Bonjour ${nombre},</p><p>Sauf erreur de notre part, la facture ${numero} d'un montant de ${importe}, échue le ${vence}, n'a pas encore été réglée. Il s'agit peut-être d'un simple oubli : nous vous remercions de bien vouloir procéder au règlement dès que possible.</p>`;
    } else if (d.paso === 2) {
      asunto = `Deuxième rappel — facture ${d.numero} impayée`;
      cuerpo = `<p>Bonjour ${nombre},</p><p>Nous revenons vers vous au sujet de la facture ${numero}, échue le ${vence}, dont le solde de ${importe} reste à régler malgré notre premier rappel. Nous vous remercions de procéder au paiement dans les meilleurs délais.</p>`;
    } else {
      asunto = `Dernier rappel avant relance formelle — facture ${d.numero}`;
      cuerpo = `<p>Bonjour ${nombre},</p><p>Malgré nos précédents rappels, la facture ${numero} d'un montant de ${importe}, échue le ${vence}, demeure impayée. Nous vous demandons de régulariser cette situation sous huit jours. À défaut, nous serons contraints d'engager une relance formelle, avec application des pénalités de retard prévues dans nos conditions générales.</p>`;
    }
  } else if (d.paso === 1) {
    asunto = `Recordatorio de pago — factura ${d.numero}`;
    cuerpo = `<p>Estimado/a ${nombre},</p><p>Salvo error por nuestra parte, la factura ${numero} por importe de ${importe}, con vencimiento el ${vence}, aún no figura como pagada. Puede tratarse de un simple olvido: le agradecemos que realice el pago en cuanto le sea posible.</p>`;
  } else if (d.paso === 2) {
    asunto = `Segundo recordatorio — factura ${d.numero} pendiente`;
    cuerpo = `<p>Estimado/a ${nombre},</p><p>Volvemos a escribirle en relación con la factura ${numero}, vencida el ${vence}, cuyo importe pendiente de ${importe} sigue sin abonarse tras nuestro primer recordatorio. Le rogamos que realice el pago a la mayor brevedad.</p>`;
  } else {
    asunto = `Último aviso antes de reclamación formal — factura ${d.numero}`;
    cuerpo = `<p>Estimado/a ${nombre},</p><p>Pese a nuestros recordatorios anteriores, la factura ${numero} por importe de ${importe}, vencida el ${vence}, continúa impagada. Le pedimos que regularice el pago en un plazo de ocho días. En caso contrario, nos veremos obligados a iniciar una reclamación formal, con los intereses de demora previstos en nuestras condiciones generales.</p>`;
  }
  return { asunto, html: `${cuerpo}${banco}${contacto}${firma}${pie}` };
}
