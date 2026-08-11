export type Proveedor = {
  id: string;
  created_at: string;
  pais: string | null;
  razon_social: string | null;
  identificador: string | null;
  identificador_extra: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
};

export type NuevoProveedor = Omit<Proveedor, 'id' | 'created_at'>;
