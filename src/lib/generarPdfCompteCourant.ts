import jsPDF from 'jspdf';
import { cabeceraDocumento, piePagina } from './pdfEmpresa';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';

export type MovimientoCompteCourant = {
  tipo: 'aportacion' | 'devolucion';
  importe: number;
  fecha: string; // ISO yyyy-mm-dd
};

function fmtEur(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

/** Plantilla reutilizable de "convention de compte courant d'associé" — apport (Mario presta dinero
 * a la EURL) o remboursement (la société le devuelve lo prestado). No lleva intérêts (gratuit, lo
 * habitual en una EURL unipersonal) y recuerda la regla legal: el saldo del gérant asocié nunca
 * puede quedar negativo (art. L223-21 Code de commerce, interdit — abus de biens sociaux). Se genera
 * cada vez que hay un movimiento real, con la fecha/importe de ese momento — no es una décision de
 * l'associé unique en sentido estricto (es un contrato de préstamo bilateral, aunque las dos partes
 * sean la misma persona en distinta calidad), así que usa su propia cabecera, no la de "DÉCISION". */
export async function generarPdfCompteCourant(mov: MovimientoCompteCourant): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const titulo =
    mov.tipo === 'aportacion'
      ? "CONVENTION DE COMPTE COURANT D'ASSOCIÉ — APPORT"
      : "CONVENTION DE COMPTE COURANT D'ASSOCIÉ — REMBOURSEMENT";
  const { entidad, margen } = await cabeceraDocumento(doc, titulo);

  const fechaMov = new Date(`${mov.fecha}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const fechaHoy = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  let y = 40;
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  const anchoTexto = 210 - margen * 2;

  const parrafo = (texto: string, opts: { negrita?: boolean; espacioAntes?: number; espacioDespues?: number } = {}) => {
    y += opts.espacioAntes ?? 0;
    doc.setFont(FUENTE_PDF, opts.negrita ? 'bold' : 'normal');
    const lineas = doc.splitTextToSize(texto, anchoTexto);
    doc.text(lineas, margen, y);
    y += lineas.length * 5 + (opts.espacioDespues ?? 6);
  };

  parrafo(
    `Entre M. ${entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo'}, associé unique et gérant de la société ` +
      `${entidad.razon_social || 'Reformas Ordoñez'}, entreprise unipersonnelle à responsabilité limitée (EURL) dont le ` +
      `siège social est situé ${entidad.direccion || ''}, immatriculée au Registre du Commerce et des Sociétés de Bayonne ` +
      `sous le numéro ${entidad.identificador || ''}, agissant ici d'une part en son nom propre et d'autre part au nom de ` +
      'la société qu\'il représente,',
    { espacioDespues: 8 },
  );
  parrafo('IL A ÉTÉ CONVENU CE QUI SUIT :', { negrita: true, espacioDespues: 8 });

  parrafo('Article 1 — Objet', { negrita: true, espacioDespues: 4 });
  parrafo(
    mov.tipo === 'aportacion'
      ? `M. ${entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo'} apporte en compte courant d'associé la somme de ` +
          `${fmtEur(mov.importe)}, versée à la société le ${fechaMov}. Cette somme constitue une créance de l'associé sur la ` +
          "société, distincte du capital social, remboursable selon les modalités de l'article 2."
      : `La société rembourse à M. ${entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo'} la somme de ` +
          `${fmtEur(mov.importe)} le ${fechaMov}, en remboursement partiel ou total de son compte courant d'associé.`,
  );

  parrafo('Article 2 — Intérêts et remboursement', { negrita: true, espacioDespues: 4 });
  parrafo(
    "Cette avance est consentie sans intérêts (compte courant gratuit). Le remboursement du compte courant est libre : " +
      "l'associé peut en demander le remboursement, en tout ou partie, à tout moment, dans la limite de la trésorerie " +
      'disponible de la société.',
  );

  parrafo('Article 3 — Interdiction de solde débiteur', { negrita: true, espacioDespues: 4 });
  parrafo(
    "Conformément à l'article L223-21 du Code de commerce, le compte courant de l'associé-gérant ne pourra jamais " +
      "présenter un solde débiteur — la société ne peut en aucun cas consentir d'avance, de prêt ou de découvert à " +
      "son gérant associé unique, personne physique.",
    { espacioDespues: 16 },
  );

  parrafo(`Fait à Hendaye, le ${fechaHoy}, en un exemplaire original conservé au siège social.`, { espacioDespues: 20 });
  parrafo("L'associé,", { espacioDespues: 20 });
  parrafo(entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo', { negrita: true });

  piePagina(
    doc,
    margen,
    'Document préparé pour Reformas Ordoñez — devient effectif une fois daté et signé. Conservez les justificatifs du ' +
      'virement bancaire correspondant à ce mouvement.',
  );

  doc.save(`compte-courant-${mov.tipo}-${mov.fecha}.pdf`);
}
