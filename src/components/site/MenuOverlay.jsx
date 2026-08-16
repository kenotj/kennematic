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

import { useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import { CONTACT_EMAIL } from '../../lib/constants.js';
import { PROJECTS } from '../../lib/projects.js';

const LINK_CLASS = [
  'font-display font-extrabold uppercase leading-[110%]',
  'text-[length:var(--fs-work)]',
  '[transition:opacity_200ms_linear]',
  '[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-[.65]',
  'focus-visible:[outline:2px_solid_var(--red)]',
  'focus-visible:[outline-offset:4px]',
].join(' ');

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
      className="menu-overlay fixed inset-0 z-[60] bg-black/55 [backdrop-filter:blur(24px)_saturate(140%)] [-webkit-backdrop-filter:blur(24px)_saturate(140%)] pointer-events-auto overflow-y-auto"
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
      <button
        type="button"
        onClick={onClose}
        className="glass absolute rounded-full px-[18px] py-[10px] font-body uppercase text-[length:var(--fs-micro)] tracking-[0.08em] cursor-pointer text-white focus-visible:[outline:2px_solid_var(--red)] focus-visible:[outline-offset:2px]"
        style={{
          top: 'calc(var(--top-header) + env(safe-area-inset-top))',
          right: 'var(--pad-header)',
        }}
      >
        Close
      </button>

      <motion.nav
        className="flex min-h-full flex-col justify-center gap-[2.2vw]"
        style={{ padding: 'calc(var(--pad-header) * 2) var(--pad-header)' }}
        variants={list}
        onClick={onClose}
      >
        <motion.div variants={item}>
          <Link href="/" className={LINK_CLASS}>
            Home
          </Link>
        </motion.div>
        <motion.div variants={item} className="flex flex-col gap-[0.8vw]">
          <Link href="/projects" className={LINK_CLASS}>
            Projects
          </Link>
          <div className="flex flex-col gap-[0.4vw] pl-[2vw]">
            {PROJECTS.map((p) => (
              <Link
                key={p.slug}
                href={`/projects/${p.slug}`}
                className="font-body text-[length:var(--fs-ui)] opacity-70 [transition:opacity_200ms_linear] hover:opacity-100 focus-visible:[outline:2px_solid_var(--red)] focus-visible:[outline-offset:4px]"
              >
                {p.client} — {p.title}
              </Link>
            ))}
          </div>
        </motion.div>
        <motion.div variants={item}>
          <Link href="/about" className={LINK_CLASS}>
            About
          </Link>
        </motion.div>
        <motion.div variants={item}>
          <Link href="/playground" className={LINK_CLASS}>
            Playground
          </Link>
        </motion.div>
        <motion.div variants={item}>
          <a href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASS}>
            Contact
          </a>
        </motion.div>
      </motion.nav>
    </motion.div>
  );
}
