export function Fuente({ url }: { url: string | null }) {
  if (!url) return null;
  let dominio = url;
  try {
    dominio = new URL(url).hostname.replace('www.', '');
  } catch {
    // url no parseable, se muestra tal cual
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-gray-400 hover:text-brand hover:underline">
      Fuente: {dominio}
    </a>
  );
}
