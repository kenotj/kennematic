'use client';

/* KENNEMATIC — landing nav: one floating glass pill, top-left.
 *
 * Wordmark + Menu button; everything else lives in the MenuOverlay. Tailwind
 * ancestor variants let the pill join the landing-only `is-ready` entrance.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

import MenuOverlay from './site/MenuOverlay.jsx';
import { LiquidFill, liquidInk, LIQUID_INK_TRANSITION } from './site/liquidHover.jsx';

/* Each half is its own hover host and clips its own flood, so the wordmark
   fills from the pill's left edge and Menu fills from its right — the pill
   reads as two tanks meeting at the divider rather than one bar crossing it.
 *
 * The 16px padding lives on the halves, not the pill, so a flood reaches the
 * pill's outer edge; a padded pill would leave a dry rim. The pill's own
 * `overflow-hidden` is what rounds off the square corners of each fill. */
const ITEM_CLASS = [
  'relative flex min-h-11 items-center px-3.5 py-2.5 sm:px-4',
  'font-display text-micro font-bold uppercase tracking-[0.08em] whitespace-nowrap',
  'focus-visible:outline-2 focus-visible:outline-red focus-visible:-outline-offset-2',
].join(' ');

const ITEM_MOTION = {
  initial: 'rest',
  animate: 'rest',
  whileHover: 'hover',
  whileTap: 'tap',
};

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  /* On the landing page the wordmark's href is the page you're already on, so
   * letting it navigate does nothing visible — the whole piece is scroll
   * position, and you stay wherever you were. Rewind the runway instead.
   *
   * Native smooth scrolling rather than a tween: the runway is 900vh, and a
   * scripted animation over that distance fights any wheel or touch input that
   * arrives mid-flight. The browser's own smooth scroll yields to the user.
   *
   * Only plain left-clicks on the landing route are intercepted — modified
   * clicks (new tab, middle button) and every other route fall through to
   * <Link>, which is also what keeps this correct if the header is ever
   * reused off the landing page. */
  const onWordmark = useCallback(
    (e) => {
      if (pathname !== '/') return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      e.preventDefault();
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    },
    [pathname]
  );

  return (
    <>
      <nav
        className="header absolute top-[calc(var(--spacing-header-top)+env(safe-area-inset-top))] left-page"
      >
        <div className="glass pointer-events-auto flex translate-y-0 items-center overflow-hidden rounded-full opacity-100 blur-none transition-[opacity,filter,transform] duration-700 delay-300 ease-expo [.js:not(.is-ready)_&]:-translate-y-2.5 [.js:not(.is-ready)_&]:opacity-0 [.js:not(.is-ready)_&]:blur-[8px] motion-reduce:!translate-y-0 motion-reduce:!blur-none motion-reduce:delay-0 motion-reduce:duration-200">
          <motion.div {...ITEM_MOTION}>
            <Link href="/" onClick={onWordmark} className={ITEM_CLASS}>
              <LiquidFill from="left" scale="sm" />
              <motion.span
                className="relative"
                variants={liquidInk}
                transition={LIQUID_INK_TRANSITION}
              >
                KENNEMATIC
              </motion.span>
            </Link>
          </motion.div>
          <span aria-hidden="true" className="relative h-[12px] w-px shrink-0 bg-white/25" />
          <motion.button
            {...ITEM_MOTION}
            type="button"
            onClick={() => setMenuOpen(true)}
            className={`${ITEM_CLASS} cursor-pointer border-0 bg-transparent text-white`}
          >
            <LiquidFill from="right" scale="sm" />
            <motion.span
              className="relative"
              variants={liquidInk}
              transition={LIQUID_INK_TRANSITION}
            >
              Menu
            </motion.span>
          </motion.button>
        </div>
      </nav>
      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
