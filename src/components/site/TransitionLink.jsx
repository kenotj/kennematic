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
 */

import { forwardRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
  { href, onClick, children, ...rest },
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
      document.startViewTransition(() => router.push(href));
    },
    [href, onClick, router]
  );

  return (
    <Link ref={ref} href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
});

export default TransitionLink;
