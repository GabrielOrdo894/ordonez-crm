export type MensajeEquipo = {
  id: string;
  autor_id: string;
  autor_nombre: string;
  destinatario_id: string | null;
  destinatario_ids: string[] | null;
  asunto: string | null;
  texto: string;
  adjunto_url: string | null;
  adjunto_nombre: string | null;
  adjuntos: { url: string; nombre: string }[] | null;
  hilo_id: string | null;
  created_at: string;
  leido_por: string[] | null;
  archivado_por: string[] | null;
  eliminado_por: string[] | null;
  destacado_por: string[] | null;
  borrador: boolean;
  automatico: boolean;
};

export type UsuarioEquipo = {
  id: string;
  nombre: string;
};

export function conId(lista: string[] | null, id: string): string[] {
  return lista?.includes(id) ? lista : [...(lista ?? []), id];
}

export function sinId(lista: string[] | null, id: string): string[] {
  return (lista ?? []).filter((x) => x !== id);
}

export function noLeido(m: MensajeEquipo, userId: string) {
  return m.autor_id !== userId && !m.leido_por?.includes(userId);
}

export function enPapelera(m: MensajeEquipo, userId: string) {
  return !!m.eliminado_por?.includes(userId);
}

export function enArchivo(m: MensajeEquipo, userId: string) {
  return !!m.archivado_por?.includes(userId) && !enPapelera(m, userId);
}

export function enGeneral(m: MensajeEquipo, userId: string) {
  return !m.borrador && !enArchivo(m, userId) && !enPapelera(m, userId);
}

export function enBandeja(m: MensajeEquipo, userId: string) {
  return enGeneral(m, userId) && m.autor_id !== userId;
}

export function enEnviados(m: MensajeEquipo, userId: string) {
  return !m.borrador && m.autor_id === userId && !enPapelera(m, userId);
}

export function enBorradores(m: MensajeEquipo, userId: string) {
  return m.borrador && m.autor_id === userId && !enPapelera(m, userId);
}

export function esDestacado(m: MensajeEquipo, userId: string) {
  return !!m.destacado_por?.includes(userId);
}

export function enDestacados(m: MensajeEquipo, userId: string) {
  return esDestacado(m, userId) && !m.borrador && !enPapelera(m, userId);
}

export function deCompanero(m: MensajeEquipo, companeroId: string) {
  return m.autor_id === companeroId && !m.borrador;
}

export function esImagen(nombre: string | null) {
  return /\.(png|jpe?g|gif|webp)$/i.test(nombre ?? '');
}

export function adjuntosDe(m: MensajeEquipo): { url: string; nombre: string }[] {
  if (m.adjuntos && m.adjuntos.length > 0) return m.adjuntos;
  if (m.adjunto_url) return [{ url: m.adjunto_url, nombre: m.adjunto_nombre ?? 'Adjunto' }];
  return [];
}

// El hilo se identifica por el id del mensaje raíz: si "m" ya es una respuesta, hilo_id apunta a
// esa raíz; si "m" es el primer mensaje del hilo, todavía no tiene hilo_id y la raíz es su propio id.
export function raizHilo(m: MensajeEquipo): string {
  return m.hilo_id ?? m.id;
}

export function mensajesDelHilo(mensajes: MensajeEquipo[], m: MensajeEquipo): MensajeEquipo[] {
  const raiz = raizHilo(m);
  return mensajes.filter((x) => raizHilo(x) === raiz).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function participantesHilo(hilo: MensajeEquipo[], userId: string): string[] {
  const ids = new Set<string>();
  for (const m of hilo) {
    ids.add(m.autor_id);
    for (const d of m.destinatario_ids ?? []) ids.add(d);
  }
  ids.delete(userId);
  return Array.from(ids);
}
