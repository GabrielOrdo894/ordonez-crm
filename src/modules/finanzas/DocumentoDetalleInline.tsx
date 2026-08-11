import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Pencil, FileSignature, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { DropdownMenu, type AccionMenu } from '../../components/ui/DropdownMenu';
import { fechaCorta } from '../../lib/fechas';
import { cargarEventos, registrarEvento } from '../../lib/eventos';
import { registrarEventoFunnel, ETAPA_FUNNEL_POR_ESTADO_PRESUPUESTO } from '../../lib/funnelTracking';
import { notaSistema } from '../../lib/notaSistema';
import { generarPdfPresupuesto } from '../../lib/generarPdfPresupuesto';
import { generarPdfFactura } from '../../lib/generarPdfFactura';
import { enviarPresupuestoAFirmar } from '../../lib/documenso';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { agruparClientes, normalizarTelefono } from '../clientes/types';
import { ClienteFicha } from '../clientes/ClienteFicha';
import type { Visita } from '../visitas/types';
import { PresupuestoPreview } from './presupuestos/PresupuestoPreview';
import { PresupuestoForm } from './presupuestos/PresupuestoForm';
import { CrearAcompteModal } from './presupuestos/CrearAcompteModal';
import type { Presupuesto } from './presupuestos/types';
import type { Linea } from './lineas';
import { FacturaPreview } from './facturas/FacturaPreview';
import { FacturaForm } from './facturas/FacturaForm';
import { RegistrarPagoModal } from './facturas/RegistrarPagoModal';
import type { Factura } from './facturas/types';

export type TipoDocumento = 'presupuesto' | 'factura';

const VARIANTE_ESTADO: Record<string, 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'vencida' | 'default'> = {
  Borrador: 'default',
  Pendiente: 'pendiente',
  Aceptado: 'realizada',
  Rechazado: 'cancelada',
  Cobrada: 'realizada',
  'Cobrada parcialmente': 'confirmada',
  Vencida: 'vencida',
};

type RelacionItem = { tipo: TipoDocumento; id: string; label: string; sublabel: string };

type DocumentoDetalleInlineProps = {
  tipo: TipoDocumento;
  id: string;
  onClose: () => void;
  onAbrirOtro: (tipo: TipoDocumento, id: string) => void;
};

export function DocumentoDetalleInline({ tipo, id, onClose, onAbrirOtro }: DocumentoDetalleInlineProps) {
  const { user } = useAuth();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [facturandoCompleta, setFacturandoCompleta] = useState(false);
  const [creandoNormalVinculado, setCreandoNormalVinculado] = useState(false);
  const [creandoAcompte, setCreandoAcompte] = useState(false);
  const [acompteAConstruir, setAcompteAConstruir] = useState<{ linea: Linea; fecha: string } | null>(null);
  const [registrandoPago, setRegistrandoPago] = useState(false);
  const [clienteAbierto, setClienteAbierto] = useState(false);

  const { data: presupuesto, refetch: refetchPresupuesto } = useQuery({
    queryKey: ['presupuesto', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('presupuestos').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Presupuesto;
    },
    enabled: tipo === 'presupuesto' && !!id,
  });

  const { data: factura, refetch: refetchFactura } = useQuery({
    queryKey: ['factura', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturas').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Factura;
    },
    enabled: tipo === 'factura' && !!id,
  });

  const doc = tipo === 'presupuesto' ? presupuesto : factura;

  const { data: eventos } = useQuery({
    queryKey: ['documento_eventos', tipo, id],
    queryFn: () => cargarEventos(tipo, id),
    enabled: !!id,
  });

  const { data: relaciones } = useQuery({
    queryKey: ['documento_relaciones', tipo, id, presupuesto?.presupuesto_origen_id, presupuesto?.tipo, factura?.presupuesto_id],
    queryFn: async (): Promise<RelacionItem[]> => {
      const items: RelacionItem[] = [];
      if (tipo === 'factura' && factura) {
        if (factura.presupuesto_id) {
          const { data: p, error: errorP } = await supabase.from('presupuestos').select('*').eq('id', factura.presupuesto_id).single();
          if (errorP) throw errorP;
          if (p) items.push({ tipo: 'presupuesto', id: p.id, label: `Presupuesto ${p.numero ?? ''}`, sublabel: p.estado });
          const { data: hermanas, error: errorHermanas } = await supabase
            .from('facturas')
            .select('*')
            .is('eliminado_en', null)
            .eq('presupuesto_id', factura.presupuesto_id)
            .neq('id', factura.id);
          if (errorHermanas) throw errorHermanas;
          for (const f of (hermanas ?? []) as Factura[]) {
            items.push({
              tipo: 'factura',
              id: f.id,
              label: `${f.tipo === 'acompte' ? 'Anticipo' : f.tipo === 'rectificativa' ? 'Rectificativa' : 'Factura'} ${f.numero ?? ''}`,
              sublabel: f.estado_cobro,
            });
          }
        }
      } else if (tipo === 'presupuesto' && presupuesto) {
        const { data: vinculadas, error: errorVinculadas } = await supabase
          .from('facturas')
          .select('*')
          .is('eliminado_en', null)
          .eq('presupuesto_id', presupuesto.id);
        if (errorVinculadas) throw errorVinculadas;
        for (const f of (vinculadas ?? []) as Factura[]) {
          items.push({
            tipo: 'factura',
            id: f.id,
            label: `${f.tipo === 'acompte' ? 'Anticipo' : f.tipo === 'rectificativa' ? 'Rectificativa' : 'Factura'} ${f.numero ?? ''}`,
            sublabel: f.estado_cobro,
          });
        }
        if (presupuesto.presupuesto_origen_id) {
          const { data: origen, error: errorOrigen } = await supabase
            .from('presupuestos')
            .select('*')
            .eq('id', presupuesto.presupuesto_origen_id)
            .single();
          if (errorOrigen) throw errorOrigen;
          if (origen) items.push({ tipo: 'presupuesto', id: origen.id, label: `Presupuesto orientativo ${origen.numero ?? ''}`, sublabel: origen.estado });
        }
        if (presupuesto.tipo === 'orientativo') {
          const { data: hijos, error: errorHijos } = await supabase
            .from('presupuestos')
            .select('*')
            .is('eliminado_en', null)
            .eq('presupuesto_origen_id', presupuesto.id);
          if (errorHijos) throw errorHijos;
          for (const p of (hijos ?? []) as Presupuesto[]) {
            items.push({ tipo: 'presupuesto', id: p.id, label: `Presupuesto normal ${p.numero ?? ''}`, sublabel: p.estado });
          }
        }
      }
      return items;
    },
    enabled: !!doc,
  });

  const { data: visitas } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Visita[];
    },
    enabled: !!doc,
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);
  const cliente = useMemo(() => {
    if (!doc?.cliente_tel) return null;
    const tel = normalizarTelefono(doc.cliente_tel);
    return clientes.find((c) => normalizarTelefono(c.telefono) === tel) ?? null;
  }, [clientes, doc?.cliente_tel]);

  const eliminarMutation = useMutation({
    mutationFn: async () => {
      const tabla = tipo === 'presupuesto' ? 'presupuestos' : 'facturas';
      const { error } = await supabase
        .from(tabla)
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: nombreUsuarioActual })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tipo === 'presupuesto' ? 'presupuestos' : 'facturas'] });
      toast.success(tipo === 'presupuesto' ? 'Presupuesto movido a la papelera' : 'Factura movida a la papelera');
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const cambiarEstadoMutation = useMutation({
    mutationFn: async (estado: string) => {
      const { error } = await supabase.from('presupuestos').update({ estado }).eq('id', id);
      if (error) throw error;
      await registrarEvento('presupuesto', id, `Marcado como ${estado}`);
      const etapaFunnel = ETAPA_FUNNEL_POR_ESTADO_PRESUPUESTO[estado];
      if (etapaFunnel) await registrarEventoFunnel(etapaFunnel, { presupuestoId: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presupuestos'] });
      queryClient.invalidateQueries({ queryKey: ['documento_eventos', 'presupuesto', id] });
      refetchPresupuesto();
      toast.success('Estado actualizado');
    },
    onError: (error) => toast.error(error.message),
  });

  const quitarPagoMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('facturas')
        .update({ estado_cobro: 'Pendiente', fecha_pago: null, monto_pagado: null })
        .eq('id', id);
      if (error) throw error;
      await registrarEvento('factura', id, 'Registro de pago revertido — vuelve a Pendiente');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      queryClient.invalidateQueries({ queryKey: ['documento_eventos', 'factura', id] });
      refetchFactura();
      toast.success('Registro de pago eliminado, factura vuelve a Pendiente');
    },
    onError: (error) => toast.error(error.message),
  });

  const [linkDocumensoModal, setLinkDocumensoModal] = useState<string | null>(null);

  const enviarDocumensoMutation = useMutation({
    mutationFn: async (regenerar: boolean = false) => {
      if (!presupuesto) throw new Error('Presupuesto no cargado');
      return enviarPresupuestoAFirmar(presupuesto, { regenerar });
    },
    onSuccess: async (resultado) => {
      setLinkDocumensoModal(resultado.signingUrl);
      if (presupuesto?.visita_id) {
        await notaSistema(presupuesto.visita_id, `Presupuesto ${presupuesto.numero} enviado a firmar con Documenso`);
      }
      await registrarEvento('presupuesto', id, 'Enviado a firmar con Documenso');
      queryClient.invalidateQueries({ queryKey: ['presupuestos'] });
      queryClient.invalidateQueries({ queryKey: ['documento_eventos', 'presupuesto', id] });
      refetchPresupuesto();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleObtenerFirma = () => {
    if (presupuesto?.documenso_signing_url) {
      setLinkDocumensoModal(presupuesto.documenso_signing_url);
    } else {
      enviarDocumensoMutation.mutate(false);
    }
  };

  const copiarLinkDocumenso = () => {
    if (!linkDocumensoModal) return;
    navigator.clipboard.writeText(linkDocumensoModal);
    toast.success('Enlace copiado');
  };

  const handleDescargarPdf = async () => {
    try {
      if (tipo === 'presupuesto' && presupuesto) await conAvisoDescarga(() => generarPdfPresupuesto(presupuesto), toast);
      if (tipo === 'factura' && factura) await conAvisoDescarga(() => generarPdfFactura(factura), toast);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el PDF'));
    }
  };

  const handleEliminar = async () => {
    if (!(await confirmar(`¿Eliminar ${tipo === 'presupuesto' ? 'el presupuesto' : 'la factura'} ${doc?.numero ?? ''}? Se moverá a la Papelera.`))) return;
    eliminarMutation.mutate();
  };

  const volver = () => (
    <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3">
      <ArrowLeft size={15} />
      Volver a {tipo === 'presupuesto' ? 'presupuestos' : 'facturas'}
    </button>
  );

  if (!doc) return volver();

  if (editando) {
    if (tipo === 'presupuesto') {
      return (
        <PresupuestoForm
          presupuesto={presupuesto}
          onClose={() => {
            setEditando(false);
            refetchPresupuesto();
          }}
        />
      );
    }
    return (
      <FacturaForm
        factura={factura}
        onClose={() => {
          setEditando(false);
          refetchFactura();
        }}
      />
    );
  }

  if (facturandoCompleta && presupuesto) {
    return (
      <FacturaForm
        desdePresupuesto={presupuesto}
        onClose={() => {
          setFacturandoCompleta(false);
          queryClient.invalidateQueries({ queryKey: ['documento_relaciones'] });
          queryClient.invalidateQueries({ queryKey: ['documento_eventos'] });
        }}
      />
    );
  }

  if (acompteAConstruir && presupuesto) {
    return (
      <FacturaForm
        desdePresupuesto={presupuesto}
        lineaAcompte={acompteAConstruir.linea}
        fechaAcompte={acompteAConstruir.fecha}
        onClose={() => {
          setAcompteAConstruir(null);
          queryClient.invalidateQueries({ queryKey: ['documento_relaciones'] });
          queryClient.invalidateQueries({ queryKey: ['documento_eventos'] });
        }}
      />
    );
  }

  if (creandoNormalVinculado && presupuesto) {
    return (
      <PresupuestoForm
        presupuesto={null}
        desdeOrientativo={presupuesto}
        onClose={() => {
          setCreandoNormalVinculado(false);
          queryClient.invalidateQueries({ queryKey: ['documento_relaciones'] });
        }}
      />
    );
  }

  const numero = doc.numero ?? '—';
  const titulo = doc.titulo ?? '';
  const estado = tipo === 'presupuesto' ? presupuesto!.estado : factura!.estado_cobro;
  const fechas =
    tipo === 'presupuesto'
      ? `${fechaCorta(presupuesto!.fecha_emision)} → ${fechaCorta(presupuesto!.fecha_validez)}`
      : `${fechaCorta(factura!.fecha_factura)} → ${fechaCorta(factura!.fecha_vence)}`;

  return (
    <div className="animate-[scale-in_180ms_ease-out]">
      {volver()}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            {tipo === 'presupuesto' ? (presupuesto?.tipo === 'orientativo' ? 'Presupuesto orientativo' : 'Presupuesto') : 'Factura'}
          </p>
          <h1 className="text-lg font-semibold text-gray-900">
            {numero}
            {titulo && <span className="font-normal text-gray-500"> · {titulo}</span>}
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant={VARIANTE_ESTADO[estado] ?? 'default'}>{estado}</Badge>
            <span className="text-xs text-gray-400">{fechas}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={handleDescargarPdf}>
            <span className="flex items-center gap-1.5">
              <Download size={14} />
              Descargar PDF
            </span>
          </Button>
          <Button variant="primary" onClick={() => setEditando(true)}>
            <span className="flex items-center gap-1.5">
              <Pencil size={14} />
              Editar
            </span>
          </Button>
          {tipo === 'presupuesto' && presupuesto && presupuesto.tipo !== 'orientativo' && !presupuesto.firmado && (
            <Button variant="secondary" onClick={handleObtenerFirma} disabled={enviarDocumensoMutation.isPending}>
              <span className="flex items-center gap-1.5">
                <FileSignature size={14} />
                {enviarDocumensoMutation.isPending
                  ? 'Generando…'
                  : presupuesto.documenso_signing_url
                    ? 'Ver enlace de firma'
                    : 'Obtener enlace de firma'}
              </span>
            </Button>
          )}
          <DropdownMenu
            acciones={[
              ...(tipo === 'presupuesto' && presupuesto
                ? ([
                    {
                      label: 'Marcar aceptado',
                      onClick: () => cambiarEstadoMutation.mutate('Aceptado'),
                      oculto: presupuesto.estado === 'Aceptado',
                    },
                    {
                      label: 'Marcar pendiente',
                      onClick: () => cambiarEstadoMutation.mutate('Pendiente'),
                      oculto: presupuesto.estado === 'Pendiente' || presupuesto.estado === 'Aceptado',
                    },
                    {
                      label: 'Marcar rechazado',
                      onClick: () => cambiarEstadoMutation.mutate('Rechazado'),
                      oculto: presupuesto.estado === 'Rechazado',
                    },
                    {
                      label: 'Crear factura completa',
                      onClick: () => setFacturandoCompleta(true),
                      oculto: !(presupuesto.estado === 'Aceptado' && presupuesto.tipo !== 'orientativo'),
                    },
                    {
                      label: 'Crear anticipo (acompte)',
                      onClick: () => setCreandoAcompte(true),
                      oculto: !(presupuesto.estado === 'Aceptado' && presupuesto.tipo !== 'orientativo'),
                    },
                    {
                      label: 'Crear presupuesto normal vinculado',
                      onClick: () => setCreandoNormalVinculado(true),
                      oculto: !(presupuesto.estado === 'Aceptado' && presupuesto.tipo === 'orientativo'),
                    },
                  ] satisfies AccionMenu[])
                : []),
              ...(tipo === 'factura' && factura
                ? ([
                    factura.estado_cobro === 'Cobrada' || factura.estado_cobro === 'Cobrada parcialmente'
                      ? { label: 'Quitar registro de pago', onClick: () => quitarPagoMutation.mutate() }
                      : { label: 'Registrar pago', onClick: () => setRegistrandoPago(true) },
                  ] satisfies AccionMenu[])
                : []),
              { label: 'Eliminar', onClick: handleEliminar, destructivo: true },
            ]}
          />
        </div>
      </div>

      <Modal open={!!linkDocumensoModal} onClose={() => setLinkDocumensoModal(null)} title="Enlace de firma">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input value={linkDocumensoModal ?? ''} readOnly className="flex-1" />
            <Button size="sm" variant="secondary" onClick={copiarLinkDocumenso}>
              <span className="flex items-center gap-1">
                <Copy size={13} />
                Copiar
              </span>
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            Comparte este enlace con el cliente para que firme. Al firmar, el presupuesto pasará a "Aceptado"
            automáticamente.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => enviarDocumensoMutation.mutate(true)}
            disabled={enviarDocumensoMutation.isPending}
            className="self-start"
          >
            {enviarDocumensoMutation.isPending ? 'Generando…' : 'Generar nuevo enlace'}
          </Button>
        </div>
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div>{tipo === 'presupuesto' ? <PresupuestoPreview presupuesto={presupuesto!} /> : <FacturaPreview factura={factura!} />}</div>

        <div className="flex flex-col gap-4">
          <section className="bg-surface border border-gray-200 rounded-sm p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Relaciones</p>
            {!relaciones || relaciones.length === 0 ? (
              <p className="text-sm text-gray-400">No hay relaciones.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {relaciones.map((r) => (
                  <button
                    key={`${r.tipo}-${r.id}`}
                    onClick={() => onAbrirOtro(r.tipo, r.id)}
                    className="flex items-center justify-between gap-2 text-sm border border-gray-200 rounded-sm px-3 py-1.5 hover:border-brand hover:bg-brand-light text-left"
                  >
                    <span className="font-medium text-gray-800">{r.label}</span>
                    <span className="text-xs text-gray-400">{r.sublabel}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="bg-surface border border-gray-200 rounded-sm p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Eventos</p>
            {!eventos || eventos.length === 0 ? (
              <p className="text-sm text-gray-400">Sin eventos registrados.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {eventos.map((e, i) => (
                  <li key={e.id} className="flex gap-2.5">
                    <div className="flex flex-col items-center shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5" />
                      {i < eventos.length - 1 && <span className="flex-1 w-px bg-gray-200 mt-1" />}
                    </div>
                    <div className="pb-1">
                      <p className="text-sm text-gray-800">{e.evento}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(e.created_at).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="bg-surface border border-gray-200 rounded-sm p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Cliente</p>
            {cliente ? (
              <button
                onClick={() => setClienteAbierto(true)}
                className="w-full text-left border border-gray-200 rounded-sm px-3 py-2.5 hover:border-brand transition-colors"
              >
                <p className="text-sm font-semibold text-gray-900">{doc.cliente_nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">{doc.cliente_dir || '—'}</p>
                <p className="text-xs text-gray-500">{[doc.cliente_tel, doc.cliente_email].filter(Boolean).join(' · ')}</p>
                <p className="text-xs text-brand mt-1.5">Ver ficha completa del cliente</p>
              </button>
            ) : (
              <div className="border border-gray-200 rounded-sm px-3 py-2.5">
                <p className="text-sm font-semibold text-gray-900">{doc.cliente_nombre || '—'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{doc.cliente_dir || '—'}</p>
                <p className="text-xs text-gray-500">{[doc.cliente_tel, doc.cliente_email].filter(Boolean).join(' · ')}</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {tipo === 'presupuesto' && (
        <CrearAcompteModal
          presupuesto={creandoAcompte ? presupuesto! : null}
          onClose={() => setCreandoAcompte(false)}
          onCrear={(opts) => {
            setCreandoAcompte(false);
            setAcompteAConstruir(opts);
          }}
        />
      )}
      <ClienteFicha cliente={cliente} open={clienteAbierto} onClose={() => setClienteAbierto(false)} />
      {tipo === 'factura' && factura && (
        <RegistrarPagoModal
          factura={registrandoPago ? (factura ?? null) : null}
          onClose={() => {
            setRegistrandoPago(false);
            queryClient.invalidateQueries({ queryKey: ['documento_eventos', 'factura', id] });
            refetchFactura();
          }}
        />
      )}
    </div>
  );
}
