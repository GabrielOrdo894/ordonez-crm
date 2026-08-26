// Búsqueda de empresas francesas por nombre o SIRET/SIREN — API pública "Recherche d'entreprises"
// del gobierno francés (recherche-entreprises.api.gouv.fr), gratuita, sin clave, con CORS abierto
// (`access-control-allow-origin: *`, verificado 2026-08-22), pensada para llamarse directo desde
// el navegador. Agrega el registro Sirene del INSEE. La API NO devuelve el número de TVA
// intracommunautaire en ningún campo del payload (comprobado con una petición real antes de
// escribir esto) — nunca inventarlo aquí, se deja siempre para que Gabriel lo rellene a mano.
export type EmpresaFrancia = {
  siren: string;
  siret: string;
  nombre: string;
  direccion: string;
};

type RespuestaBusqueda = {
  results?: Array<{
    siren: string;
    nom_complet: string | null;
    siege?: { siret?: string; adresse?: string | null } | null;
  }>;
};

export async function buscarEmpresasFrancia(query: string): Promise<EmpresaFrancia[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&limit=5`);
  if (!res.ok) throw new Error(`Búsqueda de empresas francesas falló (${res.status})`);
  const data = (await res.json()) as RespuestaBusqueda;
  return (data.results ?? []).map((r) => ({
    siren: r.siren,
    siret: r.siege?.siret ?? '',
    nombre: r.nom_complet ?? '',
    direccion: r.siege?.adresse ?? '',
  }));
}
