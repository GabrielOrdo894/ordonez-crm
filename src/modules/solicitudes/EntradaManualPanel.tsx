import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PenLine, Lightbulb, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';

const FUENTES_MANUALES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email_directo', label: 'Email directo' },
  { value: 'manual', label: 'Otro (a mano)' },
];

const IDIOMAS = [
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
];

const vacio = { fuente: 'whatsapp', idioma: 'es', texto: '', nombre: '', email: '', telefono: '' };

type EntradaManualPanelProps = {
  onCreada: () => void;
};

export function EntradaManualPanel({ onCreada }: EntradaManualPanelProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(vacio);

  const crearMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('solicitudes').insert({
        fuente: form.fuente,
        idioma: form.idioma,
        nombre: form.nombre.trim() || null,
        email: form.email.trim() || null,
        telefono: form.telefono.trim() || null,
        comentario_cliente: form.texto.trim(),
        estado: 'Nueva',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      toast.success('Solicitud añadida');
      setForm(vacio);
      onCreada();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div>
      <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">Entrada manual</h2>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
            <span className="w-7 h-7 rounded-sm bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <PenLine size={15} />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Nueva solicitud a mano</p>
              <p className="text-xs text-gray-500">Pega el texto tal cual — la IA genera la respuesta desde "Solicitudes entrantes".</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Cómo llegó"
                options={FUENTES_MANUALES}
                value={form.fuente}
                onChange={(e) => setForm((f) => ({ ...f, fuente: e.target.value }))}
              />
              <Select
                label="Idioma del cliente"
                options={IDIOMAS}
                value={form.idioma}
                onChange={(e) => setForm((f) => ({ ...f, idioma: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Mensaje del cliente (pega el email o el WhatsApp)
              </label>
              <textarea
                value={form.texto}
                onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))}
                rows={8}
                className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
                placeholder="Hola, quería preguntar por una reforma de..."
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Nombre (si lo sabes)"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
              <Input label="Teléfono" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
              <Input label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="flex justify-end pt-1">
              <Button onClick={() => crearMutation.mutate()} disabled={crearMutation.isPending || !form.texto.trim()}>
                <span className="flex items-center gap-1.5">
                  <Plus size={14} />
                  {crearMutation.isPending ? 'Guardando…' : 'Añadir solicitud'}
                </span>
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-brand-light border border-gray-200 rounded-sm p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb size={14} className="text-brand shrink-0" />
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Cuándo usar esto</p>
          </div>
          <ul className="text-xs text-gray-700 space-y-2 list-disc pl-4">
            <li>Un cliente escribe por WhatsApp y quieres que la IA redacte la respuesta igual que con un email.</li>
            <li>Llegó un email que "Comprobar Gmail ahora" no detectó automáticamente.</li>
            <li>Marca el idioma correcto — el mensaje generado se escribe siempre en ese idioma.</li>
          </ul>
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-200">
            Al guardar aparece en "Solicitudes entrantes" como Nueva, lista para generar el mensaje.
          </p>
        </div>
      </div>
    </div>
  );
}
