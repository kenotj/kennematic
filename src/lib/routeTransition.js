'use client';

/* KENNEMATIC — handshake between the router and document.startViewTransition.
 *
 * startViewTransition(cb) freezes the old page, runs cb, and captures the
 * "new" state the moment cb's promise settles. router.push() returns void
 * and synchronously, so a callback of `() => router.push(href)` settles
 * before React has rendered a single node of the destination: the browser
 * snapshots the OLD DOM as the new state, crossfades nothing into nothing,
 * and the real page pops in afterwards. That is the flash.
 *
 * So the callback returns a promise instead, resolved from RouteWatcher —
 * mounted in the root layout, so it survives the very navigations the links
 * initiate (the link itself unmounts and could never resolve its own promise).
 *
 * The resolve waits two frames past the commit. The landing page paints its
 * plate from a rAF loop outside React, and a snapshot taken on the commit
 * frame would catch a black canvas and crossfade to it.
 */

const FRAMES = 2;
const TIMEOUT_MS = 800; /* a navigation that never lands must not freeze the page */

let pending = null;

function settle() {
  if (!pending) return;
  const { resolve, timer, raf } = pending;
  pending = null;
  clearTimeout(timer);
  if (raf) cancelAnimationFrame(raf);
  resolve();
}

/* Called by the link, inside the view transition, just before router.push. */
export function beginRouteTransition() {
  settle(); /* never leave two outstanding */
  return new Promise((resolve) => {
    pending = { resolve, timer: setTimeout(settle, TIMEOUT_MS), raf: 0 };
  });
}

/* Called by RouteWatcher once the destination has committed. */
export function finishRouteTransition() {
  if (!pending) return;
  let left = FRAMES;
  const tick = () => {
    if (!pending) return;
    if (--left > 0) {
      pending.raf = requestAnimationFrame(tick);
      return;
    }
    settle();
  };
  pending.raf = requestAnimationFrame(tick);
}
