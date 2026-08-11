import type { Visita } from '../visitas/types';

export type Cliente = {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string | null;
  zona: string | null;
  pais: string | null;
  visitas: Visita[];
};

export const ETAPAS_PIPELINE = [
  'Contacto',
  'Visita programada',
  'Visita realizada',
  'Presupuesto enviado',
  'Presupuesto aceptado',
  'En obra',
  'Finalizado',
] as const;

export function normalizarTelefono(tel: string) {
  return tel.replace(/\D/g, '');
}

export function agruparClientes(visitas: Visita[]): Cliente[] {
  const grupos = new Map<string, Visita[]>();
  for (const v of visitas) {
    const clave = v.telefono ? normalizarTelefono(v.telefono) : (v.email ?? v.id);
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(v);
    else grupos.set(clave, [v]);
  }

  return Array.from(grupos.entries()).map(([clave, vs]) => {
    const ordenadas = [...vs].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    const ultima = ordenadas[0];
    return {
      id: clave,
      nombre: ultima.nombre,
      apellidos: ultima.apellidos,
      telefono: ultima.telefono,
      email: ultima.email,
      zona: ultima.zona,
      pais: ultima.pais,
      visitas: ordenadas,
    };
  });
}
