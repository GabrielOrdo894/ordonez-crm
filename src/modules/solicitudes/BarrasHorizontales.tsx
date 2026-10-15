import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';

// Barras horizontales con el número a la derecha y, si se pasa `campoPct`, el porcentaje dentro
// de la barra — mismo estilo que el embudo de DashboardPage.tsx. Usado por AsistenteWebPanel.tsx.
const VERDES = ['#0f3d24', '#1a5c38', '#2e6d49', '#3d7a5a', '#5f9878', '#7dab93', '#94b8a6', '#c8ddd0'];

type Fila = Record<string, string | number>;

type Props = {
  datos: Fila[];
  campoNombre: string;
  campoValor: string;
  campoPct?: string;
  anchoEtiqueta?: number;
  vacio?: string;
};

export function BarrasHorizontales({ datos, campoNombre, campoValor, campoPct, anchoEtiqueta = 130, vacio = 'Sin datos en este período' }: Props) {
  if (datos.length === 0) return <p className="text-sm text-gray-400 py-8 text-center">{vacio}</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, datos.length * 34 + 20)}>
      <BarChart data={datos} layout="vertical" margin={{ left: 0, right: 40 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey={campoNombre}
          width={anchoEtiqueta}
          tick={{ fontSize: 11, fill: '#374151' }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey={campoValor} radius={[0, 2, 2, 0]} isAnimationActive={false}>
          <LabelList position="right" dataKey={campoValor} fill="#374151" fontSize={11} fontWeight={600} />
          {campoPct && (
            <LabelList position="insideLeft" dataKey={campoPct} fill="#fff" fontSize={10} fontWeight={600} formatter={(v) => (Number(v) >= 8 ? `${v}%` : '')} />
          )}
          {datos.map((_, i) => (
            <Cell key={i} fill={VERDES[Math.min(i, VERDES.length - 1)]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
