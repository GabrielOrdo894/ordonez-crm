import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { CONFIG_PLANTILLA_DEFECTO, configPlantillaDesde } from '../finanzas/DocumentoPreview';
import type { ConfigPlantilla } from '../finanzas/DocumentoPreview';
import { CONFIG_PORTADA_DEFECTO, FOTO_PORTADA_DEFECTO, configPortadaDesde } from '../../lib/pdfEmpresa';
import { ENTIDAD_EJEMPLO } from '../finanzas/datosEjemploDocumento';
import { PortadaPreview } from './PortadaPreview';
import { notificarCambioConfig } from '../../lib/notificaciones';
import { guardarConfigDatos } from '../../lib/empresaConfig';
import { useHidratarUnaVez } from '../../hooks/useHidratarUnaVez';
import { pathEmpresaDesdeUrl } from './storagePaths';

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-gray-200 rounded-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
        {titulo}
      </p>
      {children}
    </section>
  );
}

export default function ConstructorPortadaPage() {
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [config, setConfig] = useState<ConfigPlantilla>(CONFIG_PLANTILLA_DEFECTO);
  const [fotoUrl, setFotoUrl] = useState('');
  const [filtroOpacidad, setFiltroOpacidad] = useState(CONFIG_PORTADA_DEFECTO.filtroOpacidad);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [previewOrientativo, setPreviewOrientativo] = useState(true);
  const [previewIdioma, setPreviewIdioma] = useState<'es' | 'fr'>('es');
  // Foto ya persistida en BD al cargar la página — se usa para poder borrarla de Storage en
  // guardarMutation si el usuario confirma un cambio (subir-y-cancelar no debe borrar nada, ver
  // comentario junto a guardarMutation más abajo).
  const fotoOriginalUrlRef = useRef('');

  const { data: empresaConfig, isLoading, error: errorEmpresaConfig } = useQuery({
    queryKey: ['empresa_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_config').select('*').eq('id', 1).single();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (errorEmpresaConfig) toast.error(`No se pudo cargar la configuración de empresa: ${errorEmpresaConfig.message}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorEmpresaConfig]);

  // Solo se hidrata una vez — el polling de 'empresa_config' no debe pisar ediciones en curso.
  useHidratarUnaVez(empresaConfig, (empresaConfig) => {
    const datos = (empresaConfig.datos ?? {}) as { plantilla_documento?: unknown; portada?: unknown };
    setConfig(configPlantillaDesde(datos.plantilla_documento));
    const portada = configPortadaDesde(datos.portada);
    setFotoUrl(portada.fotoUrl);
    fotoOriginalUrlRef.current = portada.fotoUrl;
    setFiltroOpacidad(portada.filtroOpacidad);
  });

  const datosEmpresa = (empresaConfig?.datos ?? {}) as { logo_url?: string; logo_oficial_url?: string };
  const logoOficialUrl = datosEmpresa.logo_oficial_url || datosEmpresa.logo_url || '';

  const actualizarDatos = async (
    parcial: Record<string, unknown> | ((datosActuales: Record<string, unknown>) => Record<string, unknown>),
  ) => {
    await guardarConfigDatos(parcial);
    queryClient.invalidateQueries({ queryKey: ['empresa_config'] });
  };

  const TAMANO_MAX_IMAGEN = 10 * 1024 * 1024; // 10 MB

  const handleSubirLogo = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se admiten imágenes');
      return;
    }
    if (file.size > TAMANO_MAX_IMAGEN) {
      toast.error(`La imagen pesa demasiado (máximo ${TAMANO_MAX_IMAGEN / 1024 / 1024} MB)`);
      return;
    }
    setSubiendoLogo(true);
    const logoAnteriorUrl = datosEmpresa.logo_oficial_url ?? '';
    const extension = file.name.split('.').pop() ?? 'png';
    const path = `logo_oficial_${Date.now()}.${extension}`;
    const { error: errorSubida } = await supabase.storage.from('empresa').upload(path, file, { contentType: file.type, upsert: true });
    if (errorSubida) {
      setSubiendoLogo(false);
      toast.error(errorSubida.message);
      return;
    }
    const { data } = supabase.storage.from('empresa').getPublicUrl(path);
    try {
      await actualizarDatos({ logo_oficial_url: data.publicUrl });
      toast.success('Logo oficial actualizado');
      notificarCambioConfig(user, 'cambió el logo oficial en el Constructor de portadas.');
      // Cada subida usaba un nombre con Date.now() distinto — sin borrar el anterior, el bucket
      // acumulaba un archivo huérfano por cada cambio de logo (bug real corregido 2026-08-18).
      // Best-effort: un fallo aquí no debe impedir usar el logo recién subido.
      const pathAnterior = pathEmpresaDesdeUrl(logoAnteriorUrl);
      if (pathAnterior) {
        const { error: errorBorrado } = await supabase.storage.from('empresa').remove([pathAnterior]);
        if (errorBorrado) console.warn('No se pudo borrar el logo oficial anterior en Storage:', errorBorrado.message);
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
    setSubiendoLogo(false);
  };

  const handleSubirFoto = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se admiten imágenes');
      return;
    }
    if (file.size > TAMANO_MAX_IMAGEN) {
      toast.error(`La imagen pesa demasiado (máximo ${TAMANO_MAX_IMAGEN / 1024 / 1024} MB)`);
      return;
    }
    setSubiendoFoto(true);
    const extension = file.name.split('.').pop() ?? 'jpg';
    const path = `portada_${Date.now()}.${extension}`;
    const { error: errorSubida } = await supabase.storage.from('empresa').upload(path, file, { contentType: file.type, upsert: true });
    if (errorSubida) {
      setSubiendoFoto(false);
      toast.error(errorSubida.message);
      return;
    }
    const { data } = supabase.storage.from('empresa').getPublicUrl(path);
    setFotoUrl(data.publicUrl);
    setSubiendoFoto(false);
    toast.success('Foto de portada subida — pulsa Guardar para confirmar');
  };

  const guardarMutation = useMutation({
    // Solo se editan aquí portadaTaglineEs/Fr (dentro de plantilla_documento, clave compartida con
    // ConstructorPlantillasPage y PlantillasSection) y 'portada' completo (esta pantalla es la
    // única dueña de esa clave). Releer y fusionar solo esos dos campos, no el `config` local
    // completo — evita revertir un color/estilo cambiado mientras tanto en otra pestaña (bug real
    // corregido 2026-08-18).
    mutationFn: () =>
      actualizarDatos((datosActuales) => {
        const fresca = configPlantillaDesde((datosActuales as { plantilla_documento?: unknown }).plantilla_documento);
        return {
          plantilla_documento: { ...fresca, portadaTaglineEs: config.portadaTaglineEs, portadaTaglineFr: config.portadaTaglineFr },
          portada: { foto_url: fotoUrl, filtro_opacidad: filtroOpacidad },
        };
      }),
    onSuccess: () => {
      toast.success('Portada guardada');
      notificarCambioConfig(user, 'actualizó el Constructor de portadas (foto, filtro o frase).');
      // Solo se borra la foto anterior AQUÍ, tras un guardado real confirmado — borrarla ya al
      // subir la nueva (como si hiciera guardarConfigDatos de inmediato) rompería la portada si
      // el usuario sube una foto y luego sale sin pulsar "Guardar" (bug real corregido
      // 2026-08-18, mismo patrón que el logo, pero la foto no se persiste hasta guardar).
      const fotoAnterior = fotoOriginalUrlRef.current;
      if (fotoAnterior && fotoAnterior !== fotoUrl) {
        const pathAnterior = pathEmpresaDesdeUrl(fotoAnterior);
        if (pathAnterior) {
          supabase.storage
            .from('empresa')
            .remove([pathAnterior])
            .then(({ error: errorBorrado }) => {
              if (errorBorrado) console.warn('No se pudo borrar la foto de portada anterior en Storage:', errorBorrado.message);
            });
        }
      }
      fotoOriginalUrlRef.current = fotoUrl;
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <button
          onClick={() => navigate('/configuracion')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={15} />
          Volver a configuración
        </button>
        <Button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}>
          {guardarMutation.isPending ? 'Guardando...' : 'Guardar portada'}
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          <Bloque titulo="Logo oficial">
            <p className="text-xs text-gray-400 mb-3">
              Logo que aparece en la portada y en la cabecera de todos los presupuestos, facturas y plannings. Es
              distinto del logo de Configuración, que solo se usa en la barra lateral del CRM.
            </p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 border border-gray-200 rounded-sm flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
                {logoOficialUrl ? (
                  <img src={logoOficialUrl} alt="Logo oficial" className="max-w-full max-h-full object-contain" />
                ) : (
                  <ImageIcon size={20} className="text-gray-300" />
                )}
              </div>
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleSubirLogo(e.target.files[0])}
                  disabled={subiendoLogo}
                  className="text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">{subiendoLogo ? 'Subiendo...' : 'Se guarda al instante.'}</p>
              </div>
            </div>
          </Bloque>

          <Bloque titulo="Foto de portada">
            <p className="text-xs text-gray-400 mb-3">
              Foto de fondo de la portada de los presupuestos en formato completo. Recomendado: orientación vertical,
              buena resolución (mín. 1200px de alto).
            </p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-20 border border-gray-200 rounded-sm flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
                {fotoUrl || FOTO_PORTADA_DEFECTO ? (
                  <img src={fotoUrl || FOTO_PORTADA_DEFECTO} alt="Foto de portada" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={20} className="text-gray-300" />
                )}
              </div>
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleSubirFoto(e.target.files[0])}
                  disabled={subiendoFoto}
                  className="text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {subiendoFoto ? 'Subiendo...' : fotoUrl ? 'Foto propia — pulsa Guardar para confirmar.' : 'Usando la foto por defecto.'}
                </p>
              </div>
            </div>
          </Bloque>

          <Bloque titulo="Filtro blanco">
            <p className="text-xs text-gray-400 mb-3">
              Aclara la foto de portada para que el texto y los iconos destaquen sobre ella, como en la imagen de
              inspiración.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={90}
                value={filtroOpacidad}
                onChange={(e) => setFiltroOpacidad(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm text-gray-600 w-10 text-right">{filtroOpacidad}%</span>
            </div>
          </Bloque>

          <Bloque titulo="Frase de la franja inferior">
            <p className="text-xs text-gray-400 mb-2">
              Frase que acompaña al icono en la franja verde inferior de la portada. El resto de datos (logo,
              dirección, teléfono, CIF/TVA...) se rellenan automáticamente según el país del cliente.
            </p>
            <label className="block text-xs text-gray-500 mb-1">Español</label>
            <input
              value={config.portadaTaglineEs}
              onChange={(e) => setConfig((c) => ({ ...c, portadaTaglineEs: e.target.value }))}
              className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm mb-2 focus:border-brand focus:outline-none"
            />
            <label className="block text-xs text-gray-500 mb-1">Francés</label>
            <input
              value={config.portadaTaglineFr}
              onChange={(e) => setConfig((c) => ({ ...c, portadaTaglineFr: e.target.value }))}
              className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
          </Bloque>
        </div>

        <div className="w-full lg:w-[380px] shrink-0 lg:sticky lg:top-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Vista previa en vivo</p>
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => setPreviewIdioma('es')}
                className={`px-1.5 py-0.5 rounded-sm ${previewIdioma === 'es' ? 'bg-brand text-white' : 'text-gray-400 hover:text-gray-700'}`}
              >
                ES
              </button>
              <button
                onClick={() => setPreviewIdioma('fr')}
                className={`px-1.5 py-0.5 rounded-sm ${previewIdioma === 'fr' ? 'bg-brand text-white' : 'text-gray-400 hover:text-gray-700'}`}
              >
                FR
              </button>
            </div>
          </div>
          <div className="flex gap-1.5 mb-3">
            <button
              onClick={() => setPreviewOrientativo(true)}
              className={`flex-1 text-xs px-2 py-1.5 rounded-sm border ${
                previewOrientativo ? 'bg-brand text-white border-brand' : 'bg-surface text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Presupuesto orientativo
            </button>
            <button
              onClick={() => setPreviewOrientativo(false)}
              className={`flex-1 text-xs px-2 py-1.5 rounded-sm border ${
                !previewOrientativo ? 'bg-brand text-white border-brand' : 'bg-surface text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Presupuesto normal
            </button>
          </div>
          <PortadaPreview
            colorPrimario={config.colorPrimario}
            colorSecundario={config.colorSecundario}
            logoUrl={logoOficialUrl || undefined}
            fotoUrl={fotoUrl || FOTO_PORTADA_DEFECTO}
            filtroOpacidad={filtroOpacidad}
            tagline={previewIdioma === 'fr' ? config.portadaTaglineFr : config.portadaTaglineEs}
            entidad={ENTIDAD_EJEMPLO}
            pais="España"
            tituloProyecto={previewIdioma === 'fr' ? 'Rénovation de salle de bain' : 'Reforma de baños'}
            esOrientativo={previewOrientativo}
            idioma={previewIdioma}
            numero="P-2026-0042"
            fechaEmision="15 / 07 / 26"
          />
        </div>
      </div>
    </div>
  );
}
