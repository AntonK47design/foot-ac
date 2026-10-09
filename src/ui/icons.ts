/** Tiny inline SVG icons (no network, crisp at any DPR). */
const svg = (body: string, vb = '0 0 24 24'): string =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS: Record<string, string> = {
  cash: svg(
    '<rect x="2" y="6" width="20" height="12" rx="3" fill="#3DDC84" stroke="#1E9E5A" stroke-width="1.6"/><circle cx="12" cy="12" r="3.4" fill="#1E9E5A"/><text x="12" y="14.6" font-size="6.5" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="900">$</text>',
  ),
  coin: svg('<circle cx="12" cy="12" r="9" fill="#FFC83D" stroke="#D9930F" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="#FFE18A"/>'),
  star: svg('<path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z" fill="#FFC83D" stroke="#D9930F" stroke-width="1.4" stroke-linejoin="round"/>'),
  ball: svg(
    '<circle cx="12" cy="12" r="9.5" fill="#fff" stroke="#22262e" stroke-width="1.6"/><path d="M12 7.3l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" fill="#22262e"/><path d="M12 2.6v4.7M15.3 9.7l4.4-1.6M14 13.6l2.8 3.7M10 13.6l-2.8 3.7M8.7 9.7L4.3 8.1" stroke="#22262e" stroke-width="1.4"/>',
  ),
  gear: svg(
    '<path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8.6 4.9l1.9 1.5-2 3.5-2.3-.9a7.6 7.6 0 01-2 1.2l-.4 2.4h-4l-.4-2.4a7.6 7.6 0 01-2-1.2l-2.3.9-2-3.5 1.9-1.5a7.7 7.7 0 010-2.3L1.5 9.1l2-3.5 2.3.9a7.6 7.6 0 012-1.2L8.2 2.9h4l.4 2.4a7.6 7.6 0 012 1.2l2.3-.9 2 3.5-1.9 1.5a7.7 7.7 0 010 2.3z" fill="#fff"/>',
  ),
  goal: svg('<path d="M3 19V7h18v12" fill="none" stroke="#1d2433" stroke-width="2.4"/><path d="M5 9h14M5 12h14M5 15h14M8 7v12M12 7v12M16 7v12" stroke="#7d8db0" stroke-width="1"/>'),
  cones: svg('<path d="M12 3l5 16H7z" fill="#FF8A3D"/><path d="M9.2 12h5.6l.8 3H8.4z" fill="#fff"/><rect x="5" y="18.5" width="14" height="2.5" rx="1" fill="#FF8A3D"/>'),
  wall: svg('<rect x="3" y="6" width="18" height="12" rx="2" fill="#2F6BFF"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="1.3" fill="#FFD23F"/>'),
  track: svg('<path d="M4 20L9 4M20 20L15 4M12 4v3M12 10v4M12 17v3" stroke="#E2583E" stroke-width="2.6" stroke-linecap="round"/>'),
  chair: svg('<rect x="6" y="3" width="12" height="9" rx="2" fill="#2F6BFF"/><rect x="5" y="11" width="14" height="4" rx="1.5" fill="#2F6BFF"/><path d="M7 15v6M17 15v6" stroke="#C9D2DE" stroke-width="2"/>'),
  staff: svg('<circle cx="12" cy="7" r="4" fill="#FFDBB4"/><path d="M4 21c0-5 3.6-8 8-8s8 3 8 8z" fill="#FF8A1F"/>'),
  bench: svg('<rect x="3" y="7" width="18" height="3" rx="1" fill="#C98B4F"/><rect x="3" y="12" width="18" height="3" rx="1" fill="#C98B4F"/><path d="M6 15v5M18 15v5" stroke="#2a2f3a" stroke-width="2"/>'),
  flag: svg('<path d="M3 5h18" stroke="#1d2433" stroke-width="1.5"/><path d="M4 5l2 6 2-6zM10 5l2 6 2-6zM16 5l2 6 2-6z" fill="#FFD23F"/><path d="M7 5l2 6 2-6zM13 5l2 6 2-6z" fill="#2F6BFF"/>'),
  shelter: svg('<path d="M3 7h18l-2-3H5z" fill="#2F6BFF"/><path d="M5 7v13M19 7v13" stroke="#C9D2DE" stroke-width="2"/><rect x="7" y="14" width="10" height="2.5" rx="1" fill="#C98B4F"/>'),
  cooler: svg('<rect x="8" y="2" width="8" height="10" rx="3" fill="#5EC8FF"/><rect x="7" y="12" width="10" height="10" rx="2" fill="#fff" stroke="#C9D2DE"/>'),
  lane: svg('<path d="M12 3v18M3 12h18" stroke="#2F6BFF" stroke-width="4" stroke-linecap="round"/>'),
  sign: svg('<rect x="5" y="3" width="14" height="18" rx="2" fill="#fff"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#2F6BFF" stroke-width="2" stroke-linecap="round"/>'),
  move: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="#2F6BFF" stroke-width="2.4"/><circle cx="12" cy="12" r="4" fill="#2F6BFF"/>'),
  lock: svg('<rect x="5" y="10" width="14" height="11" rx="2.5" fill="#2a2f3a"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="#2a2f3a" stroke-width="2.6"/><circle cx="12" cy="15.5" r="1.8" fill="#FFC83D"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'),
  arrow: svg('<path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  whistle: svg('<circle cx="9" cy="14" r="6" fill="#FFD23F" stroke="#1d2433" stroke-width="1.6"/><path d="M12 9h9v4h-6" fill="#FFD23F" stroke="#1d2433" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9" cy="14" r="2" fill="#1d2433"/>'),
  trophy: svg('<path d="M7 3h10v5a5 5 0 01-10 0z" fill="#FFC83D" stroke="#D9930F" stroke-width="1.4"/><path d="M7 5H4a3 3 0 003 4M17 5h3a3 3 0 01-3 4" fill="none" stroke="#D9930F" stroke-width="1.6"/><path d="M10 13h4v4h-4z" fill="#D9930F"/><rect x="7" y="17" width="10" height="3.5" rx="1" fill="#2a2f3a"/>'),
  shirt: svg('<path d="M8 3l-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3c-.5 1.6-2 2.5-4 2.5S8.5 4.6 8 3z" fill="#2F6BFF" stroke="#1d2433" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 9h4" stroke="#FFD23F" stroke-width="2"/>'),
  clock: svg('<circle cx="12" cy="12" r="9" fill="#fff" stroke="#2F6BFF" stroke-width="2.4"/><path d="M12 7v5l3.5 2" fill="none" stroke="#1d2433" stroke-width="2.2" stroke-linecap="round"/>'),
  gift: svg('<rect x="3" y="9" width="18" height="12" rx="2" fill="#FF5A7A"/><rect x="2" y="7" width="20" height="4" rx="1.5" fill="#FF7E96"/><path d="M12 7v14" stroke="#FFD23F" stroke-width="3"/><path d="M12 7c-2-4-6-4-6-1.5S10 7 12 7zm0 0c2-4 6-4 6-1.5S14 7 12 7z" fill="none" stroke="#FFD23F" stroke-width="1.8"/>'),
  scroll: svg('<rect x="5" y="3" width="14" height="18" rx="2" fill="#FFF3D6" stroke="#C98B4F" stroke-width="1.4"/><path d="M8 8l1.5 1.5L12 7M8 13l1.5 1.5L12 12M14 8.5h3M14 13.5h3M8 18h9" fill="none" stroke="#2F6BFF" stroke-width="1.6" stroke-linecap="round"/>'),
  scout: svg('<circle cx="10" cy="10" r="6" fill="#DDEBFF" stroke="#1d2433" stroke-width="2.2"/><path d="M14.5 14.5L20 20" stroke="#1d2433" stroke-width="3" stroke-linecap="round"/><path d="M10 7l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="#FFC83D"/>'),
  ticket: svg('<path d="M3 7h18v3a2 2 0 000 4v3H3v-3a2 2 0 000-4z" fill="#A35CFF"/>'),
};

export function icon(id: string): string {
  return ICONS[id] ?? ICONS.star ?? '';
}
