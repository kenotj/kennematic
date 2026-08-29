/* KENNEMATIC — landing scroll memory.
 *
 * The landing page is one 900vh runway: leaving it for a sub-page and coming
 * back with scrollY at 0 rewinds the film to frame one. So the landing keeps
 * its last scroll position in sessionStorage (PlateProvider writes it, cheaply
 * throttled), and the sub-page close button asks for it back.
 *
 * The restore is one-shot and opt-in via a separate flag: only the close
 * button (and anything else that calls requestHomeScrollRestore) resumes the
 * runway. A wordmark or menu "Home" click still lands at the top, which is
 * what those affordances have always meant.
 *
 * sessionStorage can throw outright (Safari private mode, blocked site data),
 * so every access is guarded and every failure degrades to "start at the top".
 */

const POS_KEY = 'kennematic:home-scroll';
const FLAG_KEY = 'kennematic:home-restore';
const THROTTLE_MS = 200;

let latest = 0;
let lastWrite = 0;
let timer = 0;

function store() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch (e) {
    return null;
  }
}

function flush() {
  timer = 0;
  lastWrite = Date.now();
  const s = store();
  if (!s) return;
  try { s.setItem(POS_KEY, String(Math.round(latest))); } catch (e) { /* ignore */ }
}

/* Called from the scroll writer — must stay cheap. */
export function saveHomeScroll(y) {
  latest = y;
  if (timer) return;
  const dt = Date.now() - lastWrite;
  if (dt >= THROTTLE_MS) flush();
  else timer = setTimeout(flush, THROTTLE_MS - dt);
}

/* Arm the one-shot restore, just before navigating back to '/'. */
export function requestHomeScrollRestore() {
  const s = store();
  if (!s) return;
  try { s.setItem(FLAG_KEY, '1'); } catch (e) { /* ignore */ }
}

/* Returns the pixel offset to restore to, or null. Clears the flag either
 * way, so a later plain visit to '/' starts at the top again. */
export function takeHomeScrollRestore() {
  const s = store();
  if (!s) return null;
  let armed = null;
  let pos = null;
  try {
    armed = s.getItem(FLAG_KEY);
    s.removeItem(FLAG_KEY);
    pos = s.getItem(POS_KEY);
  } catch (e) {
    return null;
  }
  if (!armed || pos === null) return null;
  const y = Number(pos);
  return Number.isFinite(y) && y > 0 ? y : null;
}
