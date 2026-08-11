import {
  Package,
  Handshake,
  Building2,
  Car,
  ShieldCheck,
  Briefcase,
  Users,
  Landmark,
  Boxes,
  CreditCard,
  AlertTriangle,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react';
import { CUENTAS_FR } from './types';

export type GrupoCategoria = {
  id: string;
  nombre: string;
  icono: LucideIcon;
  colorFondo: string;
  colorTexto: string;
  cuentas: string[];
};

export const GRUPOS_CATEGORIA: GrupoCategoria[] = [
  {
    id: 'achats',
    nombre: 'Achats & matières',
    icono: Package,
    colorFondo: 'bg-blue-50',
    colorTexto: 'text-blue-700',
    cuentas: ['601', '602', '604', '605', '6061', '6063', '6064', '6068', '607'],
  },
  {
    id: 'soustraitance',
    nombre: 'Sous-traitance & personnel externe',
    icono: Handshake,
    colorFondo: 'bg-amber-50',
    colorTexto: 'text-amber-700',
    cuentas: ['611', '621'],
  },
  {
    id: 'locaux',
    nombre: 'Locaux & équipement',
    icono: Building2,
    colorFondo: 'bg-teal-50',
    colorTexto: 'text-teal-700',
    cuentas: ['612', '6132', '6135', '614', '6152', '6155', '6156'],
  },
  {
    id: 'deplacements',
    nombre: 'Déplacements & transport',
    icono: Car,
    colorFondo: 'bg-brand-light',
    colorTexto: 'text-brand',
    cuentas: ['624', '6251', '6256', '6257'],
  },
  {
    id: 'assurances',
    nombre: 'Assurances',
    icono: ShieldCheck,
    colorFondo: 'bg-red-50',
    colorTexto: 'text-red-700',
    cuentas: ['616'],
  },
  {
    id: 'services',
    nombre: 'Services & honoraires',
    icono: Briefcase,
    colorFondo: 'bg-indigo-50',
    colorTexto: 'text-indigo-700',
    cuentas: ['6226', '6227', '622', '623', '617', '618', '626', '627', '628'],
  },
  {
    id: 'personnel',
    nombre: 'Personnel & charges sociales',
    icono: Users,
    colorFondo: 'bg-cyan-50',
    colorTexto: 'text-cyan-700',
    cuentas: ['641', '644', '645', '647', '648'],
  },
  {
    id: 'impots',
    nombre: 'Impôts & taxes',
    icono: Landmark,
    colorFondo: 'bg-rose-50',
    colorTexto: 'text-rose-700',
    cuentas: ['631', '6351', '6354', '635', '637', '695'],
  },
  {
    id: 'immobilisations',
    nombre: 'Immobilisations',
    icono: Boxes,
    colorFondo: 'bg-purple-50',
    colorTexto: 'text-purple-700',
    cuentas: ['205', '213', '2154', '2182', '2183', '2184', '2188', '231'],
  },
  {
    id: 'financieres',
    nombre: 'Charges financières',
    icono: CreditCard,
    colorFondo: 'bg-slate-100',
    colorTexto: 'text-slate-700',
    cuentas: ['661', '666', '668'],
  },
  {
    id: 'exceptionnelles',
    nombre: 'Charges exceptionnelles',
    icono: AlertTriangle,
    colorFondo: 'bg-orange-50',
    colorTexto: 'text-orange-700',
    cuentas: ['671', '675', '678'],
  },
  {
    id: 'amortissements',
    nombre: 'Amortissements & provisions',
    icono: TrendingDown,
    colorFondo: 'bg-gray-100',
    colorTexto: 'text-gray-600',
    cuentas: ['681', '686'],
  },
];

export function cuentaLabel(codigo: string): string {
  return CUENTAS_FR.find((c) => c.value === codigo)?.label ?? codigo;
}
