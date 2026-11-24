/**
 * Phone-sized screens (portrait phones and short landscape phones): the HUD and world labels show less there.
 * Same breakpoints as the phone layouts in styles.css. Cached; updated on rotation / resize.
 */
const QUERY = '(orientation: portrait) and (max-width: 760px), (orientation: landscape) and (max-height: 460px)';

let compact = false;
try {
  const mq = window.matchMedia(QUERY);
  compact = mq.matches;
  mq.addEventListener('change', (e) => (compact = e.matches));
} catch {
  /* no matchMedia: desktop layout */
}

export function isCompact(): boolean {
  return compact;
}
