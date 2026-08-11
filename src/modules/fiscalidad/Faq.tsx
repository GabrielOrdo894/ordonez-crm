import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

type Item = { q: string; a: string };

export function Faq({ items }: { items: Item[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);

  return (
    <div className="bg-surface border border-gray-200 rounded-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-1 flex items-center gap-1.5">
        <HelpCircle size={13} className="text-brand" /> Preguntas frecuentes
      </p>
      <div className="flex flex-col">
        {items.map((item, i) => {
          const abiertaAhora = abierta === i;
          return (
            <div key={item.q} className="border-b border-gray-100 last:border-0">
              <button
                type="button"
                onClick={() => setAbierta(abiertaAhora ? null : i)}
                className="w-full flex items-center justify-between gap-3 py-2.5 text-left text-sm text-gray-900 font-medium"
              >
                {item.q}
                <ChevronDown
                  size={14}
                  className={`shrink-0 text-gray-400 transition-transform ${abiertaAhora ? 'rotate-180' : ''}`}
                />
              </button>
              {abiertaAhora && <p className="text-xs text-gray-600 leading-relaxed pb-3">{item.a}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
