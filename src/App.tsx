import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import LoginPage from './modules/auth/LoginPage';
import { AppLayout } from './components/layout/AppLayout';

const InicioPage = lazy(() => import('./modules/visitas/InicioPage'));
const VisitasPage = lazy(() => import('./modules/visitas/VisitasPage'));
const SolicitudesPage = lazy(() => import('./modules/solicitudes/SolicitudesPage'));
const CalendarioPage = lazy(() => import('./modules/visitas/CalendarioPage'));
const VisitaDetallePage = lazy(() => import('./modules/visitas/VisitaDetallePage'));
const ClientesPage = lazy(() => import('./modules/clientes/ClientesPage'));
const ClienteDetallePage = lazy(() => import('./modules/clientes/ClienteDetallePage'));
const PipelinePage = lazy(() => import('./modules/pipeline/PipelinePage'));
const PlanningObraPage = lazy(() => import('./modules/planning/PlanningObraPage'));
const GaleriaPage = lazy(() => import('./modules/galeria/GaleriaPage'));
const PresupuestosPage = lazy(() => import('./modules/finanzas/presupuestos/PresupuestosPage'));
const FacturasPage = lazy(() => import('./modules/finanzas/facturas/FacturasPage'));
const GastosPage = lazy(() => import('./modules/finanzas/gastos/GastosPage'));
const ProveedoresPage = lazy(() => import('./modules/finanzas/proveedores/ProveedoresPage'));
const LibroIngresosPage = lazy(() => import('./modules/contabilidad/LibroIngresosPage'));
const ResultadoPage = lazy(() => import('./modules/contabilidad/ResultadoPage'));
const BancoPage = lazy(() => import('./modules/contabilidad/BancoPage'));
const FiscalidadPage = lazy(() => import('./modules/fiscalidad/FiscalidadPage'));
const ConfiguracionPage = lazy(() => import('./modules/configuracion/ConfiguracionPage'));
const ConstructorPlantillasPage = lazy(() => import('./modules/configuracion/ConstructorPlantillasPage'));
const ConstructorPlanningPage = lazy(() => import('./modules/configuracion/ConstructorPlanningPage'));
const ConstructorPortadaPage = lazy(() => import('./modules/configuracion/ConstructorPortadaPage'));
const DashboardHubPage = lazy(() => import('./modules/dashboard/DashboardHubPage'));
const PapeleraPage = lazy(() => import('./modules/papelera/PapeleraPage'));
const PerfilPage = lazy(() => import('./modules/perfil/PerfilPage'));
const AvatarGaleriaPage = lazy(() => import('./modules/perfil/AvatarGaleriaPage'));
const MensajeriaPage = lazy(() => import('./modules/mensajeria/MensajeriaPage'));

export default function App() {
  const { session, loading } = useAuth();

  if (loading) return null;

  if (!session) return <LoginPage />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<InicioPage />} />
            <Route path="/visitas" element={<VisitasPage />} />
            <Route path="/solicitudes" element={<Navigate to="/solicitudes/entrantes" replace />} />
            <Route path="/solicitudes/:tab" element={<SolicitudesPage />} />
            <Route path="/calendario" element={<CalendarioPage />} />
            <Route path="/visitas/:id" element={<VisitaDetallePage />} />
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/clientes/:id" element={<ClienteDetallePage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/planning-obra" element={<PlanningObraPage />} />
            <Route path="/galeria" element={<GaleriaPage />} />
            <Route path="/finanzas/presupuestos" element={<PresupuestosPage />} />
            <Route path="/finanzas/facturas" element={<FacturasPage />} />
            <Route path="/finanzas/proveedores" element={<ProveedoresPage />} />
            <Route path="/contabilidad/ingresos" element={<LibroIngresosPage />} />
            <Route path="/contabilidad/gastos" element={<GastosPage />} />
            <Route path="/contabilidad/resultado" element={<ResultadoPage />} />
            <Route path="/contabilidad/banco" element={<BancoPage />} />
            <Route path="/fiscalidad" element={<Navigate to="/fiscalidad/dashboard" replace />} />
            <Route path="/fiscalidad/:tab" element={<FiscalidadPage />} />
            <Route path="/dashboard" element={<DashboardHubPage />} />
            <Route path="/papelera" element={<PapeleraPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
            <Route path="/configuracion/plantillas" element={<ConstructorPlantillasPage />} />
            <Route path="/configuracion/planning" element={<ConstructorPlanningPage />} />
            <Route path="/configuracion/portada" element={<ConstructorPortadaPage />} />
            <Route path="/perfil" element={<PerfilPage />} />
            <Route path="/perfil/avatares" element={<AvatarGaleriaPage />} />
            <Route path="/mensajeria" element={<MensajeriaPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
