import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Home,
  Wrench,
  Inbox,
  Reply,
  PenLine,
  Calendar,
  Users,
  GitBranch,
  ClipboardList,
  Images,
  FileText,
  Receipt,
  Wallet,
  Truck,
  BookOpen,
  TrendingUp,
  Landmark,
  Percent,
  Scale,
  PiggyBank,
  Banknote,
  ArrowLeftRight,
  NotebookPen,
  Rows3,
  CalendarClock,
  LayoutDashboard,
  Settings,
  LogOut,
  User as UserIcon,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Sliders,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth, type Rol } from '../../hooks/useAuth';
import { useEsMobil } from '../../hooks/useEsMobil';
import { useToast } from '../../hooks/useToast';
import { estadoSeguimiento, type PresupuestoConRespuesta, type Solicitud } from '../../modules/solicitudes/types';

type NavItem = { to: string; label: string; icon: LucideIcon };
type NavSection = { title: string; icon: LucideIcon; items: NavItem[] };

const VISITAS_SECTION: NavSection = {
  title: 'Visitas',
  icon: Wrench,
  items: [
    { to: '/visitas', label: 'Visitas', icon: Wrench },
    { to: '/calendario', label: 'Calendario', icon: Calendar },
  ],
};
const SOLICITUDES_SECTION: NavSection = {
  title: 'Solicitudes',
  icon: Inbox,
  items: [
    { to: '/solicitudes/entrantes', label: 'Solicitudes entrantes', icon: Inbox },
    { to: '/solicitudes/seguimiento', label: 'Respuestas a presupuestos', icon: Reply },
    { to: '/solicitudes/manual', label: 'Entrada manual', icon: PenLine },
  ],
};
const CLIENTES_SECTION: NavSection = {
  title: 'Clientes',
  icon: Users,
  items: [
    { to: '/clientes', label: 'Clientes', icon: Users },
    { to: '/pipeline', label: 'Pipeline', icon: GitBranch },
    { to: '/planning-obra', label: 'Planning de obra', icon: ClipboardList },
    { to: '/galeria', label: 'Galería', icon: Images },
  ],
};
const FINANZAS_SECTION: NavSection = {
  title: 'Finanzas',
  icon: Wallet,
  items: [
    { to: '/finanzas/presupuestos', label: 'Presupuestos', icon: FileText },
    { to: '/finanzas/facturas', label: 'Facturas', icon: Receipt },
    { to: '/finanzas/proveedores', label: 'Proveedores', icon: Truck },
  ],
};
const CONTABILIDAD_SECTION: NavSection = {
  title: 'Contabilidad',
  icon: BookOpen,
  items: [
    { to: '/contabilidad/ingresos', label: 'Libro de Ingresos', icon: BookOpen },
    { to: '/contabilidad/gastos', label: 'Libro de Gastos', icon: Wallet },
    { to: '/contabilidad/resultado', label: 'Resultado', icon: TrendingUp },
    { to: '/contabilidad/banco', label: 'Movimientos bancarios', icon: ArrowLeftRight },
    { to: '/contabilidad/diario', label: 'Libro diario (Francia)', icon: NotebookPen },
    { to: '/contabilidad/mayor', label: 'Libro mayor (Francia)', icon: Rows3 },
  ],
};
const FISCALIDAD_SECTION: NavSection = {
  title: 'Fiscalidad',
  icon: Landmark,
  items: [
    { to: '/fiscalidad/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/fiscalidad/tva', label: 'TVA', icon: Percent },
    { to: '/fiscalidad/is', label: 'Impôt sur les Sociétés', icon: Scale },
    { to: '/fiscalidad/cotisations', label: 'Cotisations URSSAF', icon: PiggyBank },
    { to: '/fiscalidad/salario', label: 'Salario vs Dividendos', icon: Banknote },
    { to: '/fiscalidad/calendario', label: 'Calendario fiscal', icon: CalendarClock },
  ],
};

function seccionesPorRol(rol: Rol): NavSection[] {
  if (rol === 'contable') {
    return [FISCALIDAD_SECTION, CONTABILIDAD_SECTION, FINANZAS_SECTION, VISITAS_SECTION, SOLICITUDES_SECTION, CLIENTES_SECTION];
  }
  return [VISITAS_SECTION, SOLICITUDES_SECTION, CLIENTES_SECTION, FINANZAS_SECTION, CONTABILIDAD_SECTION, FISCALIDAD_SECTION];
}

const ROL_LABEL: Record<string, string> = {
  admin: 'Admin',
  gestion: 'Gestión',
  contable: 'Contable',
};

function iniciales(nombre: string) {
  return nombre
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function ItemSuelto({
  to,
  icon: Icon,
  label,
  collapsed,
  badge,
  onHover,
  onLeave,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
  badge?: number;
  onHover: (e: ReactMouseEvent<HTMLElement>) => void;
  onLeave: () => void;
}) {
  if (collapsed) {
    return (
      <NavLink
        to={to}
        end={to === '/'}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        className={({ isActive }) =>
          `flex items-center justify-center py-2.5 ${
            isActive ? 'text-white bg-surface/[.08]' : 'text-white/65 hover:text-white hover:bg-surface/[.06]'
          }`
        }
      >
        <span className="relative">
          <Icon size={17} className="shrink-0" />
          {!!badge && <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-600" />}
        </span>
      </NavLink>
    );
  }

  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center justify-between gap-2 py-2 px-4 text-sm ${
          isActive
            ? 'text-white border-l-2 border-brand-accent bg-surface/[.08]'
            : 'text-white/65 hover:text-white border-l-2 border-transparent'
        }`
      }
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon size={16} className="shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      {!!badge && (
        <span className="bg-red-600 text-white text-[10px] font-bold rounded-sm px-1.5 py-0.5 leading-none">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

type SidebarProps = {
  abiertoMobil: boolean;
  onCerrarMobil: () => void;
};

export function Sidebar({ abiertoMobil, onCerrarMobil }: SidebarProps) {
  const { user, rol, signOut } = useAuth();
  const toast = useToast();
  const SECTIONS = seccionesPorRol(rol);
  const esMobil = useEsMobil();
  const [collapsed, setCollapsed] = useState(true);
  const collapsedVisual = esMobil ? false : collapsed;
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<Set<string>>(
    () => new Set(SECTIONS.map((s) => s.title)),
  );
  const [seccionHover, setSeccionHover] = useState<{ section: NavSection; top: number; left: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ texto: string; top: number; left: number } | null>(null);
  const cierreTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [menuPerfilAbierto, setMenuPerfilAbierto] = useState(false);
  const [menuPerfilPos, setMenuPerfilPos] = useState({ bottom: 0, left: 0 });
  const perfilBtnRef = useRef<HTMLButtonElement>(null);
  const perfilPanelRef = useRef<HTMLDivElement>(null);

  const { data: mensajesNoLeidos, error: errorMensajesNoLeidos } = useQuery({
    queryKey: ['mensajes_equipo', 'no-leidos', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('mensajes_equipo')
        .select('*', { count: 'exact', head: true })
        .or(`destinatario_ids.is.null,destinatario_ids.cs.{${user.id}}`)
        .neq('autor_id', user.id)
        .not('leido_por', 'cs', `{${user.id}}`)
        .not('eliminado_por', 'cs', `{${user.id}}`);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  // Mismas queryKey/queryFn que SolicitudesPage/useNotificaciones a propósito — comparten caché
  // de Tanstack Query, así que el badge se actualiza solo (sin pedir nada extra al servidor) en
  // cuanto la revisión automática de Gmail de AppLayout u otra pantalla invalida ['solicitudes']
  // o ['presupuestos', 'respuestas-pendientes'].
  const { data: solicitudesParaBadge, error: errorSolicitudesBadge } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitudes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Solicitud[];
    },
  });
  const solicitudesNuevasCount = (solicitudesParaBadge ?? []).filter((s) => s.estado === 'Nueva').length;

  const { data: seguimientosParaBadge, error: errorSeguimientosBadge } = useQuery({
    queryKey: ['presupuestos', 'respuestas-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select(
          'id, numero, cliente_nombre, cliente_email, idioma, ultima_respuesta_cliente_resumen, ultima_respuesta_cliente_fecha, ultima_respuesta_revisada, mensaje_seguimiento_generado, mensaje_seguimiento_enviado, mensaje_seguimiento_enviado_en',
        )
        .is('eliminado_en', null)
        .not('ultima_respuesta_cliente_fecha', 'is', null)
        .order('ultima_respuesta_cliente_fecha', { ascending: false });
      if (error) throw error;
      return data as PresupuestoConRespuesta[];
    },
  });
  const seguimientosNuevosCount = (seguimientosParaBadge ?? []).filter((p) => estadoSeguimiento(p) === 'Nueva').length;

  const badgesPorRuta: Record<string, number> = {
    '/solicitudes/entrantes': solicitudesNuevasCount,
    '/solicitudes/seguimiento': seguimientosNuevosCount,
  };

  const { data: empresaConfig, error: errorEmpresaConfig } = useQuery({
    queryKey: ['empresa_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_config').select('*').eq('id', 1).single();
      if (error) throw error;
      return data;
    },
    // El Sidebar está siempre montado, así que este polling mantiene la caché compartida de
    // 'empresa_config' al día para toda la app — los cambios de un usuario llegan a los otros
    // sin necesidad de refrescar la página.
    refetchInterval: 8000,
  });
  const logoUrl = (empresaConfig?.datos as { logo_url?: string } | null)?.logo_url;

  // Estas 4 queries alimentan badges/logo del Sidebar — antes un error las dejaba en 0/stale sin
  // avisar (el Sidebar está siempre montado, así que un fallo aquí podía pasar inadvertido mucho
  // tiempo). toast se excluye de deps: ToastContext recrea su `value` en cada render, así que
  // incluirlo reengancharía este efecto en cualquier toast de cualquier pantalla de la app.
  useEffect(() => {
    const error = errorMensajesNoLeidos ?? errorSolicitudesBadge ?? errorSeguimientosBadge ?? errorEmpresaConfig;
    if (error) toast.error(error.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorMensajesNoLeidos, errorSolicitudesBadge, errorSeguimientosBadge, errorEmpresaConfig]);

  const nombre = (user?.user_metadata?.nombre as string) || user?.email || '';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  useEffect(() => {
    if (!menuPerfilAbierto) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (perfilBtnRef.current?.contains(target) || perfilPanelRef.current?.contains(target)) return;
      setMenuPerfilAbierto(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuPerfilAbierto]);

  const toggleSeccion = (title: string) => {
    setSeccionesAbiertas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(title)) siguiente.delete(title);
      else siguiente.add(title);
      return siguiente;
    });
  };

  const abrirSeccionDesdeColapsado = (title: string) => {
    setCollapsed(false);
    setSeccionesAbiertas(new Set([title]));
  };

  const cancelarCierreFlyout = () => {
    if (cierreTimeout.current) {
      clearTimeout(cierreTimeout.current);
      cierreTimeout.current = null;
    }
  };

  const programarCierreFlyout = () => {
    cierreTimeout.current = setTimeout(() => setSeccionHover(null), 150);
  };

  const abrirFlyout = (section: NavSection, rect: DOMRect) => {
    cancelarCierreFlyout();
    setSeccionHover({ section, top: rect.top, left: rect.right + 8 });
  };

  const mostrarTooltip = (texto: string, rect: DOMRect) => {
    setTooltip({ texto, top: rect.top + rect.height / 2, left: rect.right + 8 });
  };

  const ocultarTooltip = () => setTooltip(null);

  const abrirMenuPerfil = () => {
    if (!perfilBtnRef.current) return;
    const rect = perfilBtnRef.current.getBoundingClientRect();
    setMenuPerfilPos({ bottom: window.innerHeight - rect.top + 8, left: collapsedVisual ? rect.right + 8 : rect.left });
    setMenuPerfilAbierto((a) => !a);
  };

  return (
    <>
      {esMobil && abiertoMobil && (
        <div className="fixed inset-0 bg-black/40 z-30" onClick={onCerrarMobil} />
      )}
      <aside
        className={
          esMobil
            ? `fixed inset-y-0 left-0 z-40 w-[200px] bg-brand-dark flex flex-col shrink-0 transform transition-transform duration-200 ${
                abiertoMobil ? 'translate-x-0' : '-translate-x-full'
              }`
            : `${collapsed ? 'w-14' : 'w-[200px]'} bg-brand-dark h-screen sticky top-0 flex flex-col shrink-0 transition-[width] duration-150`
        }
      >
      <div className={`border-b border-white/10 flex items-center ${collapsedVisual ? 'flex-col gap-2 px-2 py-4' : 'justify-between px-4 py-5'}`}>
        <div className="flex items-center gap-2 min-w-0">
          {logoUrl ? (
            <img src={logoUrl} alt="Reformas Ordoñez" className="w-8 h-8 object-contain shrink-0 rounded-sm" />
          ) : (
            <div className="w-8 h-8 rounded-sm bg-surface/10 flex items-center justify-center text-white text-xs font-bold shrink-0">
              RO
            </div>
          )}
          {!collapsedVisual && (
            <div className="min-w-0">
              <p className="text-white text-sm font-bold leading-tight">Reformas Ordoñez</p>
              <p className="text-white/50 text-xs uppercase tracking-wide mt-0.5">Gestión interna</p>
            </div>
          )}
        </div>
        <button
          onClick={() => (esMobil ? onCerrarMobil() : setCollapsed((c) => !c))}
          className="text-white/60 hover:text-white shrink-0"
          title={esMobil ? 'Cerrar menú' : collapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          {esMobil ? <X size={18} /> : collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        <div className="mb-2 pb-2 border-b border-white/10">
          <ItemSuelto
            to="/"
            icon={Home}
            label="Inicio"
            collapsed={collapsedVisual}
            onHover={(e) => mostrarTooltip('Inicio', e.currentTarget.getBoundingClientRect())}
            onLeave={ocultarTooltip}
          />
        </div>

        {SECTIONS.map((section) => {
          const SectionIcon = section.icon;
          const abierta = seccionesAbiertas.has(section.title);

          const seccionTieneBadge = section.items.some((item) => !!badgesPorRuta[item.to]);

          if (collapsedVisual) {
            return (
              <button
                key={section.title}
                onClick={() => abrirSeccionDesdeColapsado(section.title)}
                onMouseEnter={(e) => abrirFlyout(section, e.currentTarget.getBoundingClientRect())}
                onMouseLeave={programarCierreFlyout}
                className="w-full flex items-center justify-center py-2.5 text-white/65 hover:text-white hover:bg-surface/[.06]"
              >
                <span className="relative">
                  <SectionIcon size={17} className="shrink-0" />
                  {seccionTieneBadge && <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-600" />}
                </span>
              </button>
            );
          }

          return (
            <div key={section.title} className="mb-1">
              <button
                onClick={() => toggleSeccion(section.title)}
                className="w-full flex items-center justify-between px-4 py-1.5 text-white/40 text-[10px] font-semibold uppercase tracking-widest hover:text-white/70"
              >
                <span className="flex items-center gap-1.5">
                  <SectionIcon size={12} className="shrink-0" />
                  {section.title}
                </span>
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${abierta ? 'rotate-0' : '-rotate-90'}`}
                />
              </button>

              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: abierta ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="mb-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const badge = badgesPorRuta[item.to];
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) =>
                            `flex items-center justify-between gap-2 py-2 px-4 text-sm ${
                              isActive
                                ? 'text-white border-l-2 border-brand-accent bg-surface/[.08]'
                                : 'text-white/65 hover:text-white border-l-2 border-transparent'
                            }`
                          }
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Icon size={16} className="shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </span>
                          {!!badge && (
                            <span className="bg-red-600 text-white text-[10px] font-bold rounded-sm px-1.5 py-0.5 leading-none shrink-0">
                              {badge}
                            </span>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="mt-2 pt-2 border-t border-white/10">
          <ItemSuelto
            to="/papelera"
            icon={Trash2}
            label="Papelera"
            collapsed={collapsedVisual}
            onHover={(e) => mostrarTooltip('Papelera', e.currentTarget.getBoundingClientRect())}
            onLeave={ocultarTooltip}
          />
          <ItemSuelto
            to="/configuracion"
            icon={Settings}
            label="Configuración"
            collapsed={collapsedVisual}
            onHover={(e) => mostrarTooltip('Configuración', e.currentTarget.getBoundingClientRect())}
            onLeave={ocultarTooltip}
          />
        </div>
      </nav>

      <div className="p-3 border-t border-white/10">
        <ItemSuelto
          to="/mensajeria"
          icon={MessageSquare}
          label="Mensajería"
          collapsed={collapsedVisual}
          badge={mensajesNoLeidos}
          onHover={(e) => mostrarTooltip('Mensajería', e.currentTarget.getBoundingClientRect())}
          onLeave={ocultarTooltip}
        />
      </div>

      <div className="p-3 border-t border-white/10">
        <button
          ref={perfilBtnRef}
          onClick={abrirMenuPerfil}
          onMouseEnter={collapsedVisual ? (e) => mostrarTooltip(nombre, e.currentTarget.getBoundingClientRect()) : undefined}
          onMouseLeave={collapsedVisual ? ocultarTooltip : undefined}
          className={`w-full flex items-center gap-2 rounded-sm hover:bg-surface/[.06] ${
            collapsedVisual ? 'justify-center py-2' : 'px-2 py-2 text-left'
          }`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-sm bg-surface/10 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {iniciales(nombre)}
            </div>
          )}
          {!collapsedVisual && (
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-medium truncate">{nombre}</p>
              <p className="text-white/50 text-xs">{ROL_LABEL[rol] ?? rol}</p>
            </div>
          )}
        </button>
      </div>

      {collapsedVisual &&
        seccionHover &&
        createPortal(
          <div
            onMouseEnter={cancelarCierreFlyout}
            onMouseLeave={programarCierreFlyout}
            style={{ top: seccionHover.top, left: seccionHover.left }}
            className="fixed min-w-[180px] bg-brand-dark border border-white/10 rounded-sm shadow-sm z-50 py-2 animate-[slide-right-flat_120ms_ease-out_forwards]"
          >
            <p className="px-3 pb-1.5 mb-1 border-b border-white/10 text-white/40 text-[10px] font-semibold uppercase tracking-widest">
              {seccionHover.section.title}
            </p>
            {seccionHover.section.items.map((item) => {
              const Icon = item.icon;
              const badge = badgesPorRuta[item.to];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setSeccionHover(null)}
                  className={({ isActive }) =>
                    `flex items-center justify-between gap-2 px-3 py-1.5 text-sm ${
                      isActive ? 'text-white bg-surface/10' : 'text-white/70 hover:text-white hover:bg-surface/5'
                    }`
                  }
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon size={14} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {!!badge && (
                    <span className="bg-red-600 text-white text-[10px] font-bold rounded-sm px-1.5 py-0.5 leading-none shrink-0">
                      {badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>,
          document.body,
        )}

      {collapsedVisual &&
        tooltip &&
        createPortal(
          <div
            style={{ top: tooltip.top, left: tooltip.left }}
            className="fixed whitespace-nowrap bg-brand-dark border border-white/10 text-white text-sm font-semibold px-3 py-2 rounded-sm shadow-sm z-50 animate-[slide-right_120ms_ease-out_forwards] pointer-events-none"
          >
            {tooltip.texto}
          </div>,
          document.body,
        )}

      {menuPerfilAbierto &&
        createPortal(
          <div
            ref={perfilPanelRef}
            style={{ bottom: menuPerfilPos.bottom, left: menuPerfilPos.left }}
            className="fixed w-52 bg-surface border border-gray-200 rounded-sm shadow-sm z-50 py-1 animate-[scale-in_120ms_ease-out]"
          >
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900 truncate">{nombre}</p>
              <p className="text-xs text-gray-400">{ROL_LABEL[rol] ?? rol}</p>
            </div>
            <NavLink
              to="/perfil"
              onClick={() => setMenuPerfilAbierto(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <UserIcon size={14} className="shrink-0" />
              Mi perfil
            </NavLink>
            <NavLink
              to="/dashboard"
              onClick={() => setMenuPerfilAbierto(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <LayoutDashboard size={14} className="shrink-0" />
              Dashboard
            </NavLink>
            <NavLink
              to="/configuracion"
              onClick={() => setMenuPerfilAbierto(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Settings size={14} className="shrink-0" />
              Configuración
            </NavLink>
            <NavLink
              to="/configuracion/plantillas"
              onClick={() => setMenuPerfilAbierto(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Sliders size={14} className="shrink-0" />
              Constructor de plantillas
            </NavLink>
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={() => {
                  setMenuPerfilAbierto(false);
                  signOut();
                }}
                className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-sm text-red-700 hover:bg-gray-50"
              >
                <LogOut size={14} className="shrink-0" />
                Cerrar sesión
              </button>
            </div>
          </div>,
          document.body,
        )}

      </aside>
    </>
  );
}
