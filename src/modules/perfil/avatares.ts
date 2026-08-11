export const AVATARES_ILUSTRADOS = Array.from({ length: 9 }, (_, i) => `${import.meta.env.BASE_URL}avatares/avatar-${i + 1}.jpg`);

export const PALETA_AVATARES = [
  '#1a5c38', '#0f3d24', '#475569', '#78716c', '#3b6e8f',
  '#3f7268', '#a15843', '#6b5b7a', '#6b7248', '#2f4858',
];

export function iniciales(nombre: string) {
  return nombre
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function avatarPredefinidoUrl(iniciales: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="${color}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#ffffff">${iniciales}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
