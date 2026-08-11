import { useLocation } from 'react-router-dom';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import { useTema } from '../../hooks/useTema';

const TITULOS: Record<string, string> = {
  '/': 'Inicio',
  '/visitas': 'Visitas',
  '/calendario': 'Calendario',
  '/clientes': 'Clientes',
  '/pipeline': 'Pipeline',
  '/planning-obra': 'Planning de obra',
  '/galeria': 'Galería',
  '/solicitudes/entrantes': 'Solicitudes entrantes',
  '/solicitudes/seguimiento': 'Respuestas a presupuestos',
  '/solicitudes/manual': 'Entrada manual',
  '/finanzas/presupuestos': 'Presupuestos',
  '/finanzas/facturas': 'Facturas',
  '/finanzas/proveedores': 'Proveedores',
  '/contabilidad/ingresos': 'Libro de Ingresos',
  '/contabilidad/gastos': 'Libro de Gastos',
  '/contabilidad/resultado': 'Resultado',
  '/fiscalidad/dashboard': 'Fiscalidad · Dashboard',
  '/fiscalidad/tva': 'Fiscalidad · TVA',
  '/fiscalidad/is': 'Fiscalidad · Impôt sur les Sociétés',
  '/fiscalidad/cotisations': 'Fiscalidad · Cotisations URSSAF',
  '/fiscalidad/salario': 'Fiscalidad · Salario vs Dividendos',
  '/fiscalidad/calendario': 'Fiscalidad · Calendario',
  '/dashboard': 'Dashboard',
  '/configuracion': 'Configuración',
  '/configuracion/plantillas': 'Constructor de plantillas',
  '/perfil': 'Mi perfil',
  '/mensajeria': 'Mensajería',
};

type TopbarProps = {
  onAbrirMenu: () => void;
  onAbrirBusqueda: () => void;
};

function BotonModo() {
  const { modo, alternarModo } = useTema();
  return (
    <button
      onClick={alternarModo}
      title={modo === 'claro' ? 'Activar modo oscuro' : 'Activar modo claro'}
      className="ml-auto shrink-0 text-gray-500 hover:text-gray-800"
    >
      {modo === 'claro' ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}

function BotonBusqueda({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Buscar (Ctrl/Cmd+K)"
      className="shrink-0 text-gray-500 hover:text-gray-800"
    >
      <Search size={17} />
    </button>
  );
}

export function Topbar({ onAbrirMenu, onAbrirBusqueda }: TopbarProps) {
  const location = useLocation();

  if (location.pathname === '/') {
    return (
      <header className="md:hidden bg-surface border-b border-gray-200 px-3 py-3 flex items-center gap-3">
        <button onClick={onAbrirMenu} className="text-gray-500 hover:text-gray-800">
          <Menu size={20} />
        </button>
        <BotonBusqueda onClick={onAbrirBusqueda} />
        <BotonModo />
      </header>
    );
  }

  const titulo = TITULOS[location.pathname] ?? '';

  return (
    <header className="bg-surface border-b border-gray-200 px-3 sm:px-6 py-3 flex items-center gap-3">
      <button onClick={onAbrirMenu} className="md:hidden text-gray-500 hover:text-gray-800 shrink-0">
        <Menu size={20} />
      </button>
      <h1 className="text-sm font-semibold text-gray-900 truncate">{titulo}</h1>
      <BotonBusqueda onClick={onAbrirBusqueda} />
      <BotonModo />
    </header>
  );
}
