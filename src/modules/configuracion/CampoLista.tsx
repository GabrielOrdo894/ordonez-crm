import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

type CampoListaProps = {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
};

export function CampoLista({ label, items, onChange }: CampoListaProps) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{label}</p>
      <div className="space-y-2 mb-2">
        {items.length === 0 && <p className="text-xs text-gray-400">Vacío.</p>}
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => onChange(items.map((v, idx) => (idx === i ? e.target.value : v)))}
              className="flex-1"
            />
            <Button size="sm" variant="secondary" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              Quitar
            </Button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="secondary" onClick={() => onChange([...items, ''])}>
        + Añadir
      </Button>
    </div>
  );
}
