import jsPDF from 'jspdf';
import { cabeceraDocumento, piePagina } from './pdfEmpresa';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';

export type PVReceptionData = {
  nombreObra: string;
  clienteNombre: string;
  clienteDir: string;
  fechaReception: string; // ISO yyyy-mm-dd
  conReservas: boolean;
  reservas: string; // texto libre, una reserva por línea
  presupuestoNumero: string | null;
};

/** Procès-verbal de réception des travaux — documento francés (art. 1792-6 Code civil) que cierra
 * formalmente una obra: el cliente acepta los trabajos (con o sin reservas) y esa fecha marca el
 * inicio de las garantías legales (parfait achèvement 1 año, bon fonctionnement 2 años, décennale 10
 * años). Solo aplica a obras en Francia — en España no existe este trámite formal equivalente. */
export async function generarPdfPVReception(datos: PVReceptionData): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const { entidad, margen } = await cabeceraDocumento(doc, 'PROCÈS-VERBAL DE RÉCEPTION DES TRAVAUX');

  const fechaReception = new Date(`${datos.fechaReception}T00:00:00`).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

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

  parrafo('Entre les soussignés :', { negrita: true, espacioDespues: 4 });
  parrafo(
    `${datos.clienteNombre || '________________________'}, domicilié ${datos.clienteDir || '________________________'}, ` +
      "ci-après dénommé « le Maître d'ouvrage »,",
  );
  parrafo("D'une part,", { espacioDespues: 4 });
  parrafo(
    `Et la société ${entidad.razon_social || 'Reformas Ordoñez'}, entreprise unipersonnelle à responsabilité limitée ` +
      `(EURL), dont le siège social est situé ${entidad.direccion || ''}, immatriculée au Registre du Commerce et des ` +
      `Sociétés de Bayonne sous le numéro ${entidad.siren || entidad.identificador || ''}, représentée par ` +
      `${entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo'} en sa qualité de gérant, ci-après dénommée ` +
      "« l'Entrepreneur »,",
  );
  parrafo("D'autre part,", { espacioDespues: 8 });

  parrafo(
    `Il a été procédé ce jour, le ${fechaReception}, en présence des deux parties, à la réception des travaux ` +
      `suivants : ${datos.nombreObra}${datos.presupuestoNumero ? ` (devis n° ${datos.presupuestoNumero})` : ''}, situés ` +
      `${datos.clienteDir || '________________________'}.`,
    { espacioDespues: 8 },
  );

  if (!datos.conReservas) {
    parrafo(
      "Après visite contradictoire des lieux et vérification des travaux exécutés, le Maître d'ouvrage déclare " +
        'ACCEPTER LA RÉCEPTION DES TRAVAUX SANS RÉSERVE.',
      { negrita: true, espacioDespues: 8 },
    );
  } else {
    parrafo(
      "Après visite contradictoire des lieux, le Maître d'ouvrage déclare ACCEPTER LA RÉCEPTION DES TRAVAUX AVEC LES " +
        "RÉSERVES SUIVANTES, que l'Entrepreneur s'engage à lever dans un délai raisonnable :",
      { negrita: true, espacioDespues: 4 },
    );
    const reservas = datos.reservas
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);
    for (const reserva of reservas) {
      parrafo(`•  ${reserva}`, { espacioDespues: 3 });
    }
    y += 4;
  }

  parrafo(
    "Conformément à l'article 1792-6 du Code civil, la date de la présente réception marque le point de départ des " +
      "garanties légales applicables à l'ouvrage : la garantie de parfait achèvement (1 an), la garantie de bon " +
      'fonctionnement des éléments équipables (2 ans) et la garantie décennale (10 ans).',
    { espacioDespues: 20 },
  );

  const yFirmas = y;
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(9.5);
  doc.text("Le Maître d'ouvrage,", margen, yFirmas);
  doc.text("L'Entrepreneur,", margen + 100, yFirmas);
  doc.setFont(FUENTE_PDF, 'normal');
  doc.text(datos.clienteNombre || '', margen, yFirmas + 20);
  doc.text(entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo', margen + 100, yFirmas + 20);

  piePagina(
    doc,
    margen,
    "Document préparé pour Reformas Ordoñez — devient effectif une fois daté et signé par les deux parties. En cas de " +
      "réserves, conservez ce document pour le suivi de leur levée.",
  );

  doc.save(`pv-reception-${datos.nombreObra.replace(/\s+/g, '_')}.pdf`);
}
