import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, Hash, MapPin, Phone, Mail, Receipt } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { fechaCorta } from '../../../lib/fechas';
import type { Proveedor } from './types';

type Campo = { icono: typeof Hash; label: string; valor: string };

type ProveedorPreviewProps = {
  proveedor: Proveedor;
  onVolver: () => void;
  onEditar: () => void;
};

export function ProveedorPreview({ proveedor, onVolver, onEditar }: ProveedorPreviewProps) {
  const { data: gastos } = useQuery({
    queryKey: ['gastos', 'por-proveedor', proveedor.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gastos')
        .select('id, fecha, descripcion, importe_base, importe_iva')
        .eq('proveedor_id', proveedor.id)
        .order('fecha', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as { id: string; fecha: string | null; descripcion: string | null; importe_base: number | null; importe_iva: number | null }[];
    },
  });

  const campos: Campo[] = [
    { icono: Hash, label: proveedor.pais === 'Francia' ? 'SIRET' : 'CIF', valor: proveedor.identificador || '—' },
    ...(proveedor.pais === 'Francia' ? [{ icono: Hash, label: 'TVA', valor: proveedor.identificador_extra || '—' }] : []),
    { icono: MapPin, label: 'Dirección', valor: proveedor.direccion || '—' },
    { icono: Phone, label: 'Teléfono', valor: proveedor.telefono || '—' },
    { icono: Mail, label: 'Email', valor: proveedor.email || '—' },
  ];

  return (
    <div className="max-w-3xl mx-auto animate-[scale-in_180ms_ease-out]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-5">
        <button onClick={onVolver} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a proveedores
        </button>
        <Button onClick={onEditar}>Editar</Button>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-xl font-bold text-gray-900">{proveedor.razon_social || 'Sin nombre'}</h1>
        {proveedor.pais && <Badge variant="realizada">{proveedor.pais}</Badge>}
      </div>
      <p className="text-sm text-gray-500 mb-6">Ficha del proveedor.</p>

      <div className="bg-surface border border-gray-200 rounded-sm p-4 mb-4">
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2.5 mb-4">
          <Building2 size={14} className="text-brand" />
          <p className="text-sm font-semibold text-gray-900">Datos del proveedor</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campos.map((c) => (
            <div key={c.label} className="flex items-start gap-2">
              <c.icono size={15} className="text-gray-400 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-gray-400">{c.label}</p>
                <p className="text-sm text-gray-900 break-words">{c.valor}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2.5 mb-4">
          <Receipt size={14} className="text-brand" />
          <p className="text-sm font-semibold text-gray-900">Últimos gastos vinculados</p>
        </div>
        {gastos && gastos.length === 0 && <p className="text-sm text-gray-400">Sin gastos registrados con este proveedor todavía.</p>}
        {gastos && gastos.length > 0 && (
          <div className="divide-y divide-gray-100">
            {gastos.map((g) => (
              <div key={g.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-900 truncate">{g.descripcion || 'Sin descripción'}</p>
                  <p className="text-xs text-gray-400">{fechaCorta(g.fecha)}</p>
                </div>
                <p className="text-gray-700 shrink-0 ml-3">{((g.importe_base ?? 0) + (g.importe_iva ?? 0)).toFixed(2)} €</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
