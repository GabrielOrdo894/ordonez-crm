import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { cargarEntidad, cargarConfigCompleta } from '../../../lib/pdfEmpresa';
import { renderizarTC } from '../../../lib/terminos';
import { notasLegales } from '../../../lib/generarPdfFactura';
import { mencionIvaReducida } from '../iva';
import { DocumentoPreview, configPlantillaDesde } from '../DocumentoPreview';
import { calcularTotales, porcentajeIva, tituloDocumentoFactura } from './types';
import type { Factura } from './types';

const CLASE_ESTADO_COBRO: Record<string, string> = {
  Pendiente: 'text-amber-600',
  Cobrada: 'text-brand',
  'Cobrada parcialmente': 'text-blue-600',
  Vencida: 'text-red-600',
};

const ESTADO_FR: Record<string, string> = {
  Pendiente: 'En attente',
  Cobrada: 'Payée',
  'Cobrada parcialmente': 'Payée partiellement',
  Vencida: 'En retard',
};

export function FacturaPreview({ factura }: { factura: Factura }) {
  const idiomaCorto = factura.idioma === 'Français' ? 'fr' : 'es';
  const porcentaje = porcentajeIva(factura.tipo_iva);
  const { totalSinIva, totalConIva } = calcularTotales(factura.lineas);

  const { data: entidadInfo } = useQuery({
    queryKey: ['empresa_config', 'entidad', factura.pais],
    queryFn: () => cargarEntidad(factura.pais ?? 'España'),
  });

  const { data: config } = useQuery({
    queryKey: ['empresa_config', 'completa'],
    queryFn: cargarConfigCompleta,
  });

  const { data: presupuestoOrigen } = useQuery({
    queryKey: ['presupuesto', 'numero', factura.presupuesto_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('numero, condiciones_pago, plan_pago')
        .eq('id', factura.presupuesto_id!)
        .single();
      if (error) throw error;
      return data as {
        numero: string | null;
        condiciones_pago: Record<string, string> | null;
        plan_pago: { concepto: string; porcentaje: number; importe: number }[] | null;
      };
    },
    enabled: !!factura.presupuesto_id,
  });

  const { data: acomptesPrevios } = useQuery({
    queryKey: ['facturas', 'acomptes_previos', factura.presupuesto_id, factura.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('numero, lineas')
        .eq('presupuesto_id', factura.presupuesto_id!)
        .eq('tipo', 'acompte')
        .neq('id', factura.id)
        .is('eliminado_en', null);
      if (error) throw error;
      return data as { numero: string | null; lineas: Factura['lineas'] }[];
    },
    enabled: !!factura.presupuesto_id && factura.tipo === 'normal',
  });

  const tcCrudo = idiomaCorto === 'fr' ? config?.tc_fr : config?.tc_es;
  const tc = tcCrudo ? renderizarTC(tcCrudo, undefined, idiomaCorto) : undefined;
  const mensajeGracias = idiomaCorto === 'fr' ? config?.mensaje_gracias_fr : config?.mensaje_gracias_es;
  const configPlantilla = configPlantillaDesde((config?.datos as { plantilla_documento?: unknown })?.plantilla_documento);
  const condPago = presupuestoOrigen?.condiciones_pago ?? (config?.datos as { condicionesPago?: Record<string, string> })?.condicionesPago;
  const condicionesPago = condPago
    ? {
        delai: idiomaCorto === 'fr' ? condPago.delaiFr : condPago.delaiEs,
        penalizacion: idiomaCorto === 'fr' ? condPago.penalizacionFr : condPago.penalizacionEs,
        medio: idiomaCorto === 'fr' ? condPago.medioFr : condPago.medioEs,
      }
    : undefined;

  const acomptes =
    acomptesPrevios && acomptesPrevios.length > 0
      ? {
          itemizado: acomptesPrevios.map((f) => ({
            numero: f.numero ?? '—',
            total: f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0),
          })),
        }
      : null;

  return (
    <DocumentoPreview
      plantilla={configPlantilla.estructura}
      colorPrimario={configPlantilla.colorPrimario}
      colorSecundario={configPlantilla.colorSecundario}
      mostrarLogo={configPlantilla.mostrarLogo}
      empresaClienteIzquierda={configPlantilla.empresaClienteIzquierda}
      tamanoTituloDocumento={configPlantilla.tamanoTituloDocumento}
      tamanoTituloReforma={configPlantilla.tamanoTituloReforma}
      tabla={configPlantilla.tabla}
      columnasExtra={configPlantilla.columnas}
      piePagina={configPlantilla.piePagina}
      idioma={idiomaCorto}
      tituloDocumento={tituloDocumentoFactura(factura.tipo, idiomaCorto)}
      titulo={factura.titulo ?? undefined}
      numero={factura.numero}
      entidad={entidadInfo?.entidad ?? {}}
      logoUrl={entidadInfo?.logoUrl}
      pais={factura.pais ?? 'España'}
      clienteNombre={factura.cliente_nombre ?? ''}
      clienteDir={factura.cliente_dir ?? ''}
      clienteContacto={[factura.cliente_tel, factura.cliente_email].filter(Boolean).join(' · ')}
      labelCif={(factura.pais ?? 'España') === 'Francia' ? 'SIRET' : 'CIF'}
      camposDocumento={[
        { label: idiomaCorto === 'fr' ? 'Date facture' : 'Fecha factura', valor: factura.fecha_factura ?? '' },
        { label: idiomaCorto === 'fr' ? 'Échéance' : 'Vencimiento', valor: factura.fecha_vence ?? '' },
        ...(presupuestoOrigen?.numero
          ? [{ label: idiomaCorto === 'fr' ? 'Devis associé' : 'Presupuesto asociado', valor: presupuestoOrigen.numero }]
          : []),
        {
          label: idiomaCorto === 'fr' ? 'État' : 'Estado',
          valor: idiomaCorto === 'fr' ? (ESTADO_FR[factura.estado_cobro] ?? factura.estado_cobro) : factura.estado_cobro,
          claseColor: CLASE_ESTADO_COBRO[factura.estado_cobro] ?? 'text-gray-500',
        },
      ]}
      columnasTabla={
        idiomaCorto === 'fr'
          ? ['Nº', 'Désignation', 'Qt', 'Prix unit. (HT)', 'Total', 'Total TTC']
          : ['Nº', 'Designación', 'Cant.', 'Precio unit. (s/IVA)', 'Total', 'Total con Impuestos']
      }
      lineas={factura.lineas}
      totalSinIva={totalSinIva}
      totalConIva={totalConIva}
      porcentajeIva={porcentaje}
      labelBase={idiomaCorto === 'fr' ? 'Base HT' : 'Base imponible'}
      labelIva={idiomaCorto === 'fr' ? 'TVA' : 'IVA'}
      mencionIva={mencionIvaReducida(factura.tipo_iva)}
      planPago={presupuestoOrigen?.plan_pago ?? undefined}
      labelPlanPago={idiomaCorto === 'fr' ? 'Plan de paiement' : 'Plan de pago'}
      condicionesPago={condicionesPago}
      acomptes={acomptes}
      notasLegales={notasLegales(idiomaCorto, factura.tipo_iva)}
      mensajeGracias={mensajeGracias ?? undefined}
      tc={tc}
      labelTyc={idiomaCorto === 'fr' ? 'Conditions générales' : 'Términos y condiciones'}
      nota={factura.nota ?? undefined}
      labelNota={idiomaCorto === 'fr' ? 'Note' : 'Nota'}
    />
  );
}
