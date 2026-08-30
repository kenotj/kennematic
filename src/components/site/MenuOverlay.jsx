'use client';

/* KENNEMATIC — full-screen menu: a liquid-glass sheet over whatever is behind
 * it (on the landing that's the film itself, blurred by the backdrop filter).
 *
 * Rendered by both the landing Header (inside .chrome — a pointer-events-none,
 * perspective'd fixed layer, hence the explicit pointer-events-auto and high z
 * within that stacking context) and by SiteHeader on sub-pages. Closes on
 * Escape, backdrop click, or navigating any link. The overlay only mounts on
 * open (post-hydration), so framer `initial` props are SSR-safe here.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import { CONTACT_EMAIL } from '../../lib/constants.js';
import { useProjects } from '../../lib/projectsContext.jsx';
import { LiquidFill, liquidInk, LIQUID_INK_TRANSITION } from './liquidHover.jsx';

const LINK_CLASS = [
  'flex min-h-14 w-full items-center py-2',
  'font-display text-[2rem] font-extrabold uppercase leading-[110%]',
  'sm:min-h-0 sm:w-fit sm:py-0 sm:text-work',
  'focus-visible:outline-2 focus-visible:outline-red focus-visible:outline-offset-4',
].join(' ');

/* Links rest at 85% scale; hovering (or keyboard-focusing) one grows it to
 * full size while its siblings stay small and fade slightly. `initial={false}`
 * mounts labels already at the resting scale so the menu opens small instead
 * of shrinking on entry. Scale lives on an inner span so it never fights the
 * entry variants on the wrapping motion.div. */
const NAV_DIM_TRANSITION = { duration: 0.45, ease: [0.16, 1, 0.3, 1] };

function NavLabel({ id, hovered, restOpacity = 1, children }) {
  const active = hovered === id;
  const dimmed = hovered !== null && !active;
  return (
    <motion.span
      className="inline-block origin-left"
      initial={false}
      animate={{
        scale: active ? 1 : 0.85,
        opacity: active ? 1 : dimmed ? restOpacity * 0.65 : restOpacity,
      }}
      transition={NAV_DIM_TRANSITION}
    >
      {children}
    </motion.span>
  );
}

const sheet = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease: 'easeOut' } },
};
const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, x: '-0.6em', filter: 'blur(6px)' },
  show: {
    opacity: 1,
    x: '0em',
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function MenuOverlay({ open, onClose }) {
  const { projects } = useProjects();
  const [hovered, setHovered] = useState(null);

  /* Only set the active id per-link; clearing happens on the nav itself, so
   * crossing the dead space between links doesn't pass through a "nothing
   * hovered" state and make every sibling pulse back to full size. */
  const navHoverProps = (id) => ({
    onMouseEnter: () => setHovered(id),
    onFocus: () => setHovered(id),
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <motion.div
      className="menu-overlay pointer-events-auto fixed inset-0 z-[60] min-h-dvh overflow-y-auto bg-black/55 [backdrop-filter:blur(24px)_saturate(140%)] [-webkit-backdrop-filter:blur(24px)_saturate(140%)]"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      variants={sheet}
      initial="hidden"
      animate="show"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.button
        type="button"
        onClick={onClose}
        initial="rest"
        animate="rest"
        whileHover="hover"
        whileTap="tap"
        className="glass fixed top-[calc(var(--spacing-header-top)+env(safe-area-inset-top))] right-page min-h-12 cursor-pointer overflow-hidden rounded-full px-5 py-3 font-body text-micro tracking-[0.08em] text-white uppercase focus-visible:outline-2 focus-visible:outline-red focus-visible:outline-offset-2 sm:min-h-11 sm:px-4 sm:py-2.5"
      >
        <LiquidFill from="right" scale="sm" />
        <motion.span className="relative" variants={liquidInk} transition={LIQUID_INK_TRANSITION}>
          Close
        </motion.span>
      </motion.button>

      <motion.nav
        className="flex min-h-svh flex-col justify-center gap-1 px-page pt-[calc(var(--spacing-header-top)+env(safe-area-inset-top)+5.5rem)] pb-[calc(var(--spacing-page)*2+env(safe-area-inset-bottom))] sm:gap-[2.2vw]"
        variants={list}
        onClick={onClose}
        onMouseLeave={() => setHovered(null)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setHovered(null);
        }}
      >
        <motion.div variants={item}>
          <Link href="/" className={LINK_CLASS} {...navHoverProps('home')}>
            <NavLabel id="home" hovered={hovered}>
              Home
            </NavLabel>
          </Link>
        </motion.div>
        <motion.div variants={item} className="flex flex-col gap-1 sm:gap-[0.8vw]">
          <Link href="/projects" className={LINK_CLASS} {...navHoverProps('projects')}>
            <NavLabel id="projects" hovered={hovered}>
              Projects
            </NavLabel>
          </Link>
          <div className="flex flex-col pl-4 sm:gap-[0.4vw] sm:pl-[2vw]">
            {projects.map((p) => (
              <Link
                key={p.slug}
                href={`/projects/${p.slug}`}
                className="flex min-h-12 w-full items-center py-2 font-body text-ui leading-tight focus-visible:outline-2 focus-visible:outline-red focus-visible:outline-offset-4 sm:min-h-0 sm:w-fit sm:py-0"
                {...navHoverProps(`project:${p.slug}`)}
              >
                <NavLabel id={`project:${p.slug}`} hovered={hovered} restOpacity={0.7}>
                  {p.client} — {p.title}
                </NavLabel>
              </Link>
            ))}
          </div>
        </motion.div>
        <motion.div variants={item}>
          <Link href="/about" className={LINK_CLASS} {...navHoverProps('about')}>
            <NavLabel id="about" hovered={hovered}>
              About
            </NavLabel>
          </Link>
        </motion.div>
        <motion.div variants={item}>
          <Link href="/playground" className={LINK_CLASS} {...navHoverProps('playground')}>
            <NavLabel id="playground" hovered={hovered}>
              Playground
            </NavLabel>
          </Link>
        </motion.div>
        <motion.div variants={item}>
          <a href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASS} {...navHoverProps('contact')}>
            <NavLabel id="contact" hovered={hovered}>
              Contact
            </NavLabel>
          </a>
        </motion.div>
      </motion.nav>
    </motion.div>
  );
}
