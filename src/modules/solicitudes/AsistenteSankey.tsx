import { ResponsiveContainer, Sankey, type SankeyNodeProps } from 'recharts';
import { nombreNodoSankey, type DatosSankey } from './asistenteWeb';

// Diagrama de rutas del asistente web: Abre → tipo de obra → zona → plazo → resultado. El nombre
// de cada nodo llega con el nivel delante ("2|Irún"), ver datosSankey en asistenteWeb.ts. Sin
// tooltip: mostraría ese prefijo; cada nodo ya lleva su número al lado.
const COLOR_NIVEL = ['#0f3d24', '#1a5c38', '#3d7a5a', '#5f9878'];
const COLOR_RESULTADO: Record<string, string> = {
  'Envía la solicitud': '#1a5c38',
  'Se va a WhatsApp': '#2f7d6d',
  Abandona: '#9ca3af',
};

function Nodo({ x, y, width, height, payload }: SankeyNodeProps) {
  const nivel = Number(payload.name[0]);
  const nombre = nombreNodoSankey(payload.name);
  const color = nivel === 4 ? (COLOR_RESULTADO[nombre] ?? '#9ca3af') : COLOR_NIVEL[nivel] ?? '#5f9878';
  const alFinal = nivel === 4;
  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(height, 1)} fill={color} rx={2} />
      <text
        x={alFinal ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={alFinal ? 'end' : 'start'}
        dominantBaseline="middle"
        fontSize={11}
        fill="#374151"
      >
        {nombre} · {payload.value}
      </text>
    </g>
  );
}

export function AsistenteSankey({ datos }: { datos: DatosSankey }) {
  if (datos.links.length === 0) {
    return <p className="text-sm text-gray-400 py-10 text-center">Todavía nadie ha abierto el asistente en este período</p>;
  }
  // Más alto cuantos más nodos haya en la columna más poblada, para que las etiquetas no se pisen.
  const porNivel = new Map<string, number>();
  for (const n of datos.nodes) porNivel.set(n.name[0], (porNivel.get(n.name[0]) ?? 0) + 1);
  const alto = Math.max(280, Math.max(...porNivel.values()) * 44);
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <Sankey
        data={datos}
        node={(props: SankeyNodeProps) => <Nodo {...props} />}
        link={{ stroke: '#cdddd5', strokeOpacity: 0.7 }}
        nodePadding={18}
        nodeWidth={10}
        margin={{ top: 10, right: 130, bottom: 10, left: 10 }}
        sort={false}
      />
    </ResponsiveContainer>
  );
}
