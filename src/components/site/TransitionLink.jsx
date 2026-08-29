'use client';

/* KENNEMATIC — a next/link that navigates inside a View Transition.
 *
 * The landing page is a fixed, scroll-driven stage; a hard route swap to
 * /projects cuts to a static document with no relationship to what was on
 * screen. Wrapping router.push() in document.startViewTransition() lets the
 * browser crossfade the two documents (the keyframes live in globals.css under
 * ::view-transition-old/new).
 *
 * Everything here degrades: no startViewTransition (Firefox, Safari < 18) or
 * prefers-reduced-motion falls through to plain <Link> behaviour, and so does
 * any modified click (new tab, download, middle button) — those must never be
 * intercepted.
 *
 * `scroll={false}` is for the sub-page close button: the landing restores its
 * own scroll position in a layout effect, and the router's default hop to the
 * top would land after that and undo it. It is forwarded to both navigation
 * paths — <Link>'s own and the router.push() inside the transition — because
 * either can be the one that runs.
 */

import { forwardRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { beginRouteTransition } from '../../lib/routeTransition.js';

/* A click the browser has its own meaning for — leave it alone. */
function isModified(e) {
  return (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  );
}

const TransitionLink = forwardRef(function TransitionLink(
  { href, onClick, scroll, children, ...rest },
  ref
) {
  const router = useRouter();

  const handleClick = useCallback(
    (e) => {
      if (onClick) onClick(e);
      if (isModified(e)) return;

      if (
        typeof document === 'undefined' ||
        typeof document.startViewTransition !== 'function' ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return; /* let <Link> navigate normally */
      }

      e.preventDefault();
      document.startViewTransition(() => {
        /* The promise, not the push, is what tells the browser when to
           snapshot the destination — see lib/routeTransition.js. */
        const committed = beginRouteTransition();
        router.push(href, { scroll: scroll !== false });
        return committed;
      });
    },
    [href, onClick, router, scroll]
  );

  return (
    <Link ref={ref} href={href} scroll={scroll} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
});

export default TransitionLink;
