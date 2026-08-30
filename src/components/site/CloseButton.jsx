'use client';

/* KENNEMATIC — sub-page exit.
 *
 * Sits at the right edge of the header row, on the same baseline as the nav
 * pill on the left, and returns to the landing page at the exact scroll
 * position it was left at (see lib/homeScroll.js). Same glass recipe and same
 * liquid hover as the menu's own Close, so the two read as one family.
 *
 * The X is sized in `em` off the pill's micro type, so the button's line box —
 * and therefore its height — matches the nav pill's exactly.
 */

import { motion } from 'framer-motion';

import { requestHomeScrollRestore } from '../../lib/homeScroll.js';
import TransitionLink from './TransitionLink.jsx';
import { LiquidFill, liquidInk, LIQUID_INK_TRANSITION } from './liquidHover.jsx';

const MotionLink = motion.create(TransitionLink);

/* A modified click (new tab, middle button) leaves this page open, so it must
 * not arm the one-shot restore that the next visit to '/' would then spend. */
function onExit(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
    return;
  }
  requestHomeScrollRestore();
}

export default function CloseButton() {
  return (
    <MotionLink
      href="/"
      scroll={false}
      onClick={onExit}
      aria-label="Close — back to the film"
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileTap="tap"
      className="glass fixed top-[calc(var(--spacing-header-top)+env(safe-area-inset-top))] right-page z-50 flex size-11 items-center justify-center overflow-hidden rounded-full text-micro text-white focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-red"
    >
      <LiquidFill from="right" scale="sm" />
      <motion.span
        className="relative block"
        variants={liquidInk}
        transition={LIQUID_INK_TRANSITION}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="h-[1em] w-[1em] align-[-0.15em]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M1.5 1.5 L10.5 10.5 M10.5 1.5 L1.5 10.5" />
        </svg>
      </motion.span>
    </MotionLink>
  );
}
