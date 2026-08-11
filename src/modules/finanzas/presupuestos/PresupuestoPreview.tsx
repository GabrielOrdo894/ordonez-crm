import { useQuery } from '@tanstack/react-query';
import { cargarEntidad, cargarConfigCompleta } from '../../../lib/pdfEmpresa';
import { renderizarTC } from '../../../lib/terminos';
import { mencionIvaReducida } from '../iva';
import { claseColorEstado } from '../estadoColor';
import { DocumentoPreview, configPlantillaDesde } from '../DocumentoPreview';
import { calcularTotales, calcularTotalesRango, porcentajeIva } from './types';
import type { Presupuesto } from './types';

const NOTA_ORIENTATIVO: Record<'es' | 'fr', string> = {
  es: 'Presupuesto orientativo — los precios son estimados y pueden variar tras la visita técnica.',
  fr: 'Devis indicatif — les prix sont estimés et peuvent varier après la visite technique.',
};

const ESTADO_FR: Record<string, string> = {
  Borrador: 'Brouillon',
  Pendiente: 'En attente',
  Aceptado: 'Accepté',
  Rechazado: 'Refusé',
};

export function PresupuestoPreview({ presupuesto }: { presupuesto: Presupuesto }) {
  const idiomaCorto = presupuesto.idioma === 'Français' ? 'fr' : 'es';
  const porcentaje = porcentajeIva(presupuesto.tipo_iva);
  const esOrientativo = presupuesto.tipo === 'orientativo';
  const { totalSinIva, totalConIva } = calcularTotales(presupuesto.lineas);
  const rangoTotales = esOrientativo ? calcularTotalesRango(presupuesto.lineas, porcentaje) : null;

  const { data: entidadInfo } = useQuery({
    queryKey: ['empresa_config', 'entidad', presupuesto.pais],
    queryFn: () => cargarEntidad(presupuesto.pais ?? 'España'),
  });

  const { data: config } = useQuery({
    queryKey: ['empresa_config', 'completa'],
    queryFn: cargarConfigCompleta,
  });

  const entidadConBanco = {
    ...(entidadInfo?.entidad ?? {}),
    nombre_titular: presupuesto.banco_titular || entidadInfo?.entidad?.nombre_titular || '',
    banco: presupuesto.banco_nombre || entidadInfo?.entidad?.banco || '',
    iban: presupuesto.banco_iban || entidadInfo?.entidad?.iban || '',
    bic: presupuesto.banco_bic || entidadInfo?.entidad?.bic || '',
  };

  const configPlantilla = configPlantillaDesde((config?.datos as { plantilla_documento?: unknown })?.plantilla_documento);
  const condPago = presupuesto.condiciones_pago ?? (config?.datos as { condicionesPago?: Record<string, string> })?.condicionesPago;
  const condicionesPago = condPago
    ? {
        delai: idiomaCorto === 'fr' ? condPago.delaiFr : condPago.delaiEs,
        penalizacion: idiomaCorto === 'fr' ? condPago.penalizacionFr : condPago.penalizacionEs,
        medio: idiomaCorto === 'fr' ? condPago.medioFr : condPago.medioEs,
      }
    : undefined;

  const tcCrudo = esOrientativo
    ? idiomaCorto === 'fr'
      ? config?.tc_fr_orientativo || config?.tc_fr
      : config?.tc_es_orientativo || config?.tc_es
    : idiomaCorto === 'fr'
      ? config?.tc_fr
      : config?.tc_es;
  const tc = tcCrudo ? renderizarTC(tcCrudo, presupuesto.plan_pago, idiomaCorto) : undefined;
  const mensajeGracias = idiomaCorto === 'fr' ? config?.mensaje_gracias_fr : config?.mensaje_gracias_es;

  return (
    <DocumentoPreview
      plantilla={configPlantilla.estructura}
      colorPrimario={configPlantilla.colorPrimario}
      colorSecundario={configPlantilla.colorSecundario}
      mostrarLogo={configPlantilla.mostrarLogo}
      empresaClienteIzquierda={configPlantilla.empresaClienteIzquierda}
      columnasInvertidas={configPlantilla.planPagoIzquierda}
      tamanoTituloDocumento={configPlantilla.tamanoTituloDocumento}
      tamanoTituloReforma={configPlantilla.tamanoTituloReforma}
      tabla={configPlantilla.tabla}
      columnasExtra={configPlantilla.columnas}
      piePagina={configPlantilla.piePagina}
      idioma={idiomaCorto}
      tituloDocumento={
        (idiomaCorto === 'fr' ? 'DEVIS' : 'PRESUPUESTO') + (esOrientativo ? (idiomaCorto === 'fr' ? ' INDICATIF' : ' ORIENTATIVO') : '')
      }
      titulo={presupuesto.titulo ?? undefined}
      numero={presupuesto.numero}
      entidad={entidadConBanco}
      logoUrl={entidadInfo?.logoUrl}
      pais={presupuesto.pais ?? 'España'}
      clienteNombre={presupuesto.cliente_nombre ?? ''}
      clienteDir={presupuesto.cliente_dir ?? ''}
      clienteDirExtra={presupuesto.cliente_dir_extra ?? undefined}
      clienteContacto={[presupuesto.cliente_tel, presupuesto.cliente_email].filter(Boolean).join(' · ')}
      labelCif={(presupuesto.pais ?? 'España') === 'Francia' ? 'SIRET' : 'CIF'}
      camposDocumento={[
        { label: idiomaCorto === 'fr' ? 'Numéro' : 'Número', valor: presupuesto.numero ?? '—' },
        { label: idiomaCorto === 'fr' ? 'Émission' : 'Emisión', valor: presupuesto.fecha_emision ?? '' },
        { label: idiomaCorto === 'fr' ? "Valable jusqu'au" : 'Válido hasta', valor: presupuesto.fecha_validez ?? '' },
        { label: idiomaCorto === 'fr' ? 'TVA' : 'IVA', valor: `${porcentaje}%` },
        {
          label: idiomaCorto === 'fr' ? 'État' : 'Estado',
          valor: idiomaCorto === 'fr' ? (ESTADO_FR[presupuesto.estado] ?? presupuesto.estado) : presupuesto.estado,
          claseColor: claseColorEstado(presupuesto.estado),
        },
      ]}
      columnasTabla={
        idiomaCorto === 'fr'
          ? ['Nº', 'Désignation', 'Qt', 'Prix unit. (HT)', 'Total', 'Total TTC']
          : ['Nº', 'Designación', 'Cant.', 'Precio unit. (s/IVA)', 'Total', 'Total con Impuestos']
      }
      lineas={presupuesto.lineas}
      totalSinIva={totalSinIva}
      totalConIva={totalConIva}
      totalSinIvaMax={rangoTotales?.totalSinIvaMax}
      totalConIvaMax={rangoTotales?.totalConIvaMax}
      porcentajeIva={porcentaje}
      labelBase={idiomaCorto === 'fr' ? 'Base HT' : 'Base imponible'}
      labelIva={idiomaCorto === 'fr' ? 'TVA' : 'IVA'}
      mencionIva={mencionIvaReducida(presupuesto.tipo_iva)}
      notaOrientativo={esOrientativo ? NOTA_ORIENTATIVO[idiomaCorto] : undefined}
      planPago={presupuesto.plan_pago}
      labelPlanPago={idiomaCorto === 'fr' ? 'Plan de paiement' : 'Plan de pago'}
      condicionesPago={condicionesPago}
      firmaBase64={esOrientativo ? undefined : presupuesto.firma_base64}
      firmaNombre={presupuesto.firma_nombre}
      firmaFecha={presupuesto.firma_fecha}
      labelFirma={esOrientativo ? undefined : idiomaCorto === 'fr' ? 'Signature du client' : 'Firma del cliente'}
      labelPendienteFirma={idiomaCorto === 'fr' ? 'En attente de signature' : 'Pendiente de firma'}
      mensajeGracias={mensajeGracias ?? undefined}
      tc={tc}
      labelTyc={idiomaCorto === 'fr' ? 'Conditions générales' : 'Términos y condiciones'}
      nota={presupuesto.nota ?? undefined}
      labelNota={idiomaCorto === 'fr' ? 'Note' : 'Nota'}
    />
  );
}
