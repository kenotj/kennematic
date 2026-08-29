'use client';

/* KENNEMATIC — sub-page nav: the same floating glass pill as the landing,
 * minus `.pill-enter` (that class keys off the landing-only `is-ready`
 * entrance and would leave this stuck at opacity 0 on sub-pages).
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
  'relative flex items-center px-[16px] py-[10px]',
  'font-display font-bold uppercase text-[length:var(--fs-micro)] tracking-[0.08em] whitespace-nowrap',
  'focus-visible:[outline:2px_solid_var(--red)]',
  'focus-visible:[outline-offset:-2px]',
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
      className="site-header absolute z-50"
      style={{
        top: 'calc(var(--top-header) + env(safe-area-inset-top))',
        left: 'var(--pad-header)',
      }}
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
          text so the trail reads as a location, not another nav row. */}
      {trail?.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="mt-[10px] flex flex-wrap items-center gap-[8px] px-[16px] font-display text-[length:var(--fs-micro)] font-medium uppercase tracking-[0.08em] whitespace-nowrap"
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
                    'focus-visible:[outline:2px_solid_var(--red)]',
                    'focus-visible:[outline-offset:2px]',
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
