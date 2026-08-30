'use client';

/* KENNEMATIC — sub-page nav: the same floating glass pill as the landing,
 * without the landing-only `is-ready` entrance variants.
 *
 * `trail` renders a breadcrumb under the pill — an array of { label, href? }
 * where entries with an href are links back up the tree and the last (current
 * page) is plain text, e.g. [{ label: 'Projects', href: '/projects' },
 * { label: 'Parfum spot' }] → "Projects / Parfum spot". */

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import CloseButton from './CloseButton.jsx';
import MenuOverlay from './MenuOverlay.jsx';
import { LiquidFill, liquidInk, LIQUID_INK_TRANSITION } from './liquidHover.jsx';

/* Geometry and hover mirror the landing Header pill exactly (see Header.jsx):
   the pill itself is unpadded, each half carries px-16/py-10 and is its own
   liquid-hover host, so the two pills render the same length and behave the
   same across routes. */
const ITEM_CLASS = [
  'relative flex min-h-11 items-center px-3.5 py-2.5 sm:px-4',
  'font-display text-micro font-bold uppercase tracking-[0.08em] whitespace-nowrap',
  'focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-red',
].join(' ');

const ITEM_MOTION = {
  initial: 'rest',
  animate: 'rest',
  whileHover: 'hover',
  whileTap: 'tap',
};

export default function SiteHeader({ trail }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    /* `absolute`, not fixed: the pill and trail belong to the page and scroll
       away with it. Only the CloseButton (fixed, right edge) tracks the
       viewport. `w-fit` keeps the pill shrink-wrapped — without it the wide
       nowrap breadcrumb below stretches the header box and the pill with it. */
    <header
      className="site-header absolute top-[calc(var(--spacing-header-top)+env(safe-area-inset-top))] left-page z-50"
    >
      <div className="glass flex w-fit items-center overflow-hidden rounded-full">
        <motion.div {...ITEM_MOTION}>
          <Link href="/" className={ITEM_CLASS}>
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
      {/* Breadcrumb trail, tucked under the pill and aligned to its inner
          padding. Ancestors link back up the tree; the current page is plain
          text so the trail reads as a location, not another nav row.

          The header is absolutely positioned, so it is sized shrink-to-fit by
          its widest child. A long project title must therefore be allowed to
          wrap AND be capped at the viewport, or the trail widens the header
          past the right edge and takes the whole document's scroll width with
          it — every page below then renders shifted and clipped on narrow
          screens. Only the separators stay unbreakable. */}
      {trail?.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="mt-2.5 flex max-w-[calc(100vw-var(--spacing-page)*2)] flex-wrap items-center gap-2 px-3.5 font-display text-micro font-medium tracking-[0.08em] uppercase sm:px-4"
        >
          {trail.map((item, i) => (
            <Fragment key={`${item.label}-${i}`}>
              {i > 0 && (
                <span aria-hidden="true" className="opacity-40">
                  /
                </span>
              )}
              {item.href ? (
                <Link
                  href={item.href}
                  className={[
                    'opacity-70 [transition:opacity_200ms_linear]',
                    '[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-100',
                    'focus-visible:outline-2 focus-visible:outline-red focus-visible:outline-offset-2',
                  ].join(' ')}
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </Fragment>
          ))}
        </nav>
      )}
      {/* The exit, mirrored on the right. Hidden while the menu is open —
          the overlay puts its own Close in exactly this slot. */}
      {!menuOpen && <CloseButton />}
      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
