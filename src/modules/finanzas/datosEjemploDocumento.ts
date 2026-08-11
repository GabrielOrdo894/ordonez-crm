import type { EntidadPais } from '../../lib/pdfEmpresa';
import type { Linea } from './lineas';

export const ENTIDAD_EJEMPLO: EntidadPais = {
  razon_social: 'Reformas Ordoñez S.L.',
  nombre_titular: 'Ricardo Ordoñez',
  identificador: 'B12345678',
  identificador_extra: '',
  direccion: 'Calle Mayor 12, Irún',
  telefono: '+34 600 000 000',
  email: 'info@reformasordonez.com',
  web: 'www.reformasordonez.com',
  banco: 'CaixaBank',
  iban: 'ES00 0000 0000 0000 0000 0000',
  bic: 'CAIXESBBXXX',
  seguro: 'Mapfre',
  num_attestation: 'POL-123456',
};

export const LINEAS_EJEMPLO: Linea[] = [
  {
    designacion: 'Alicatado baño completo',
    referencia: 'ALI-001',
    descripcion: 'Suministro y colocación',
    unidad: 'm2',
    tipo_servicio: 'Obra',
    cantidad: 12,
    precio_unit: 45,
    total_sin_iva: 540,
    total_con_iva: 653.4,
    es_incluido: false,
  },
  {
    designacion: 'Sanitarios (inodoro + lavabo)',
    referencia: 'SAN-001',
    descripcion: 'Gama media',
    unidad: 'ud',
    tipo_servicio: 'Suministro de materiales',
    cantidad: 1,
    precio_unit: 620,
    total_sin_iva: 620,
    total_con_iva: 750.2,
    es_incluido: false,
  },
  {
    designacion: 'Mano de obra fontanería',
    referencia: 'FON-001',
    descripcion: 'Recolocación de puntos de agua',
    unidad: 'h',
    tipo_servicio: 'Mano de obra',
    cantidad: 16,
    precio_unit: 35,
    total_sin_iva: 560,
    total_con_iva: 677.6,
    es_incluido: false,
  },
];

export const TOTAL_SIN_IVA_EJEMPLO = 1720;
export const TOTAL_CON_IVA_EJEMPLO = 2081.2;
