import { Fragment } from 'react';
import { tonoOscuro, tonoClaro } from '../finanzas/DocumentoPreview';
import type { TamanoTitulo } from '../finanzas/DocumentoPreview';
import type { EntidadPais } from '../../lib/pdfEmpresa';
import type { ConfigPlantillaPlanning } from './configPlanning';
import { parsearTextoEnriquecido } from '../../lib/textoEnriquecido';
import { fechaPlanning } from '../../lib/fechas';
import { agruparPorSeccion, diasEntreFechas, TEXTOS_CRONOGRAMA, TEXTOS_PLANNING, estadoProyectoTexto } from '../../lib/planningCronograma';

type FasePreview = {
  nombre: string;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  completada: boolean;
  seccion?: string | null;
};

type PlanningPreviewProps = {
  config: ConfigPlantillaPlanning;
  idioma?: 'es' | 'fr';
  entidad: EntidadPais;
  logoUrl?: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteDir: string;
  nombreObra: string;
  estado: string;
  fechaInicio: string | null;
  presupuestoNumero: string | null;
  presupuestoFecha: string | null;
  presupuestoTotal: number | null;
  fases: FasePreview[];
};

const TAM_TITULO: Record<TamanoTitulo, string> = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' };

function fechaCortisima(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function PlanningPreview({
  config,
  idioma = 'es',
  entidad,
  logoUrl,
  clienteNombre,
  clienteTelefono,
  clienteDir,
  nombreObra,
  estado,
  fechaInicio,
  presupuestoNumero,
  presupuestoFecha,
  presupuestoTotal,
  fases,
}: PlanningPreviewProps) {
  const t = TEXTOS_PLANNING[idioma];
  const tc = TEXTOS_CRONOGRAMA[idioma];
  const colorOscuro = tonoOscuro(config.colorPrimario);
  const colorClaro = tonoClaro(config.colorPrimario);
  const logoVisible = config.mostrarLogo && !!logoUrl;
  const cardEstilo = { backgroundColor: colorClaro, borderColor: colorClaro };
  const cardLabelEstilo = { color: colorOscuro };
  const theadEstilo = config.tabla.encabezadoColoreado
    ? { backgroundColor: config.colorPrimario, color: '#fff' }
    : { backgroundColor: '#fff', color: '#6b7280', borderBottom: '2px solid #111827' };

  const fasesConFechas = fases.filter((f) => f.fecha_inicio && f.fecha_fin);
  const inicioProyecto = fasesConFechas.reduce(
    (min, f) => (f.fecha_inicio! < min ? f.fecha_inicio! : min),
    fasesConFechas[0]?.fecha_inicio ?? '',
  );
  const finProyecto = fasesConFechas.reduce(
    (max, f) => (f.fecha_fin! > max ? f.fecha_fin! : max),
    fasesConFechas[0]?.fecha_fin ?? '',
  );
  const totalDias = fasesConFechas.length > 0 ? Math.max(diasEntreFechas(inicioProyecto, finProyecto), 1) : 1;
  const hoyISO = new Date().toISOString().slice(0, 10);
  const hoyEnRango = fasesConFechas.length > 0 && hoyISO >= inicioProyecto && hoyISO <= finProyecto;
  const pctHoy = hoyEnRango ? (diasEntreFechas(inicioProyecto, hoyISO) / totalDias) * 100 : 0;
  const grupos = agruparPorSeccion(fases);

  return (
    <div className="documento-papel bg-surface border border-gray-200 rounded-sm overflow-hidden text-[11px] leading-snug">
      <div className="px-4 py-3 flex items-center justify-between text-white" style={{ backgroundColor: colorOscuro }}>
        <div className="flex items-center gap-2 min-w-0">
          {logoVisible && <img src={logoUrl} alt="" className="w-9 h-9 object-contain shrink-0" />}
          <div className="min-w-0">
            <p className="font-bold truncate">{entidad.razon_social || 'Reformas Ordoñez'}</p>
            <p className="text-[9px] text-white/70 truncate">
              {[entidad.direccion, entidad.telefono].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-bold uppercase tracking-wide ${TAM_TITULO[config.tamanoTitulo]}`}>{t.titulo}</p>
          <p className="text-[9px] text-white/80">{estadoProyectoTexto(estado, idioma)}</p>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-sm p-2.5 border" style={cardEstilo}>
            <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
              {t.cliente}
            </p>
            <p className="text-gray-900 font-medium">{clienteNombre || '—'}</p>
            <p className="text-gray-500 text-[10px]">{clienteDir}</p>
            <p className="text-gray-500 text-[10px]">{clienteTelefono}</p>
          </div>
          <div className="rounded-sm p-2.5 border" style={cardEstilo}>
            <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
              {t.obra}
            </p>
            <p className="text-gray-900 font-medium">{nombreObra || '—'}</p>
            {fechaInicio && (
              <p className="text-gray-500 text-[10px]">
                {t.inicio}: {fechaPlanning(fechaInicio, idioma)}
              </p>
            )}
            {fasesConFechas.length > 0 && (
              <p className="text-gray-500 text-[10px]">
                {t.finPrevisto}: {fechaPlanning(finProyecto, idioma)} · {totalDias} {tc.dias}
              </p>
            )}
          </div>
        </div>

        {config.mostrarPresupuesto && presupuestoNumero && (
          <div className="rounded-sm p-2.5 border" style={cardEstilo}>
            <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
              {t.presupuesto}
            </p>
            <p className="text-gray-800 text-[10px]">
              {[presupuestoNumero, presupuestoFecha, presupuestoTotal != null && `${presupuestoTotal.toFixed(2)} €`]
                .filter(Boolean)
                .join('   ·   ')}
            </p>
          </div>
        )}

        {config.mostrarGantt && fasesConFechas.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-semibold text-gray-900 text-xs">{tc.cronograma}</p>
              <div className="flex items-center gap-2.5 text-[8px] text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: config.colorPrimario }} />
                  {tc.completada}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: config.colorPendiente }} />
                  {tc.pendiente}
                </span>
                {hoyEnRango && (
                  <span className="flex items-center gap-1">
                    <span className="w-px h-2.5 bg-gray-900 inline-block" />
                    {tc.hoy}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {grupos.map((grupo) => {
                const fasesGrupo = grupo.fases.filter((f) => f.fecha_inicio && f.fecha_fin);
                if (fasesGrupo.length === 0) return null;
                return (
                  <div key={grupo.nombre || '_sin_seccion_'} className="flex flex-col gap-1.5">
                    {grupo.nombre && (
                      <p className="text-[9px] font-semibold uppercase" style={{ color: colorOscuro }}>
                        {grupo.nombre} — {grupo.dias} {tc.dias}
                      </p>
                    )}
                    {fasesGrupo.map((f, i) => {
                      const offset = diasEntreFechas(inicioProyecto, f.fecha_inicio!);
                      const duracion = Math.max(diasEntreFechas(f.fecha_inicio!, f.fecha_fin!), 1);
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-24 shrink-0 text-[9px] text-gray-600 truncate">{f.nombre}</span>
                          <div className="flex-1 h-2.5 bg-gray-100 rounded-sm relative overflow-hidden">
                            <div
                              className="absolute top-0 bottom-0 rounded-sm"
                              style={{
                                left: `${(offset / totalDias) * 100}%`,
                                width: `${Math.max((duracion / totalDias) * 100, 2)}%`,
                                backgroundColor: f.completada ? config.colorPrimario : config.colorPendiente,
                              }}
                            />
                            {hoyEnRango && <div className="absolute top-0 bottom-0 w-px bg-gray-900" style={{ left: `${pctHoy}%` }} />}
                          </div>
                          <span className="w-20 shrink-0 text-[8px] text-gray-400 text-right whitespace-nowrap">
                            {fechaCortisima(f.fecha_inicio!)} – {fechaCortisima(f.fecha_fin!)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {config.mostrarTablaFases && (
          <table className="w-full border-collapse text-[9.5px]">
            <thead>
              <tr style={theadEstilo}>
                <th className="text-left px-1.5 py-1 font-medium">{tc.fase}</th>
                <th className="text-left px-1.5 py-1 font-medium">{tc.descripcion}</th>
                <th className="text-left px-1.5 py-1 font-medium">{tc.inicio}</th>
                <th className="text-left px-1.5 py-1 font-medium">{tc.fin}</th>
                <th className="text-right px-1.5 py-1 font-medium">{tc.duracion}</th>
                <th className="text-right px-1.5 py-1 font-medium">{tc.estado}</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => (
                <Fragment key={grupo.nombre || '_sin_seccion_'}>
                  {grupo.nombre && (
                    <tr key={`seccion-${grupo.nombre}`} style={{ backgroundColor: colorClaro }}>
                      <td colSpan={6} className="px-1.5 py-1 font-semibold" style={{ color: colorOscuro }}>
                        {grupo.nombre.toUpperCase()} — {grupo.dias != null ? `${grupo.dias} ${tc.dias}` : '—'}
                      </td>
                    </tr>
                  )}
                  {grupo.fases.map((f, i) => (
                    <tr
                      key={`${grupo.nombre}-${i}`}
                      className={config.tabla.lineas ? 'border-b border-gray-100' : ''}
                      style={config.tabla.filasIntercaladas && i % 2 === 1 ? { backgroundColor: colorClaro } : undefined}
                    >
                      <td className="px-1.5 py-1 font-semibold text-gray-900">{f.nombre}</td>
                      <td className="px-1.5 py-1 text-gray-500">
                        {f.descripcion
                          ? parsearTextoEnriquecido(f.descripcion).map((bloque, idx) => (
                              <p key={idx} className={`${bloque.negrita ? 'font-semibold' : ''} ${bloque.cursiva ? 'italic' : ''}`}>
                                {bloque.texto}
                              </p>
                            ))
                          : '—'}
                      </td>
                      <td className="px-1.5 py-1 text-gray-600">{f.fecha_inicio ? fechaPlanning(f.fecha_inicio, idioma) : '—'}</td>
                      <td className="px-1.5 py-1 text-gray-600">{f.fecha_fin ? fechaPlanning(f.fecha_fin, idioma) : '—'}</td>
                      <td className="px-1.5 py-1 text-right text-gray-600">
                        {f.fecha_inicio && f.fecha_fin ? `${diasEntreFechas(f.fecha_inicio, f.fecha_fin)} ${tc.dias}` : '—'}
                      </td>
                      <td className="px-1.5 py-1 text-right">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded-sm text-[9px] font-medium ${
                            f.completada ? 'text-white' : 'text-gray-500 bg-gray-100'
                          }`}
                          style={f.completada ? { backgroundColor: config.colorPrimario } : undefined}
                        >
                          {f.completada ? tc.completada : tc.pendiente}
                        </span>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        {config.piePagina && (
          <p className="text-gray-400 text-[9px] text-center border-t border-gray-100 pt-2 whitespace-pre-line">
            {config.piePagina}
          </p>
        )}
      </div>
    </div>
  );
}
