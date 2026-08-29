'use client';

/* KENNEMATIC — sub-page nav: the same floating glass pill as the landing,
 * minus `.pill-enter` (that class keys off the landing-only `is-ready`
 * entrance and would leave this stuck at opacity 0 on sub-pages). */

import { useState } from 'react';
import Link from 'next/link';

import CloseButton from './CloseButton.jsx';
import MenuOverlay from './MenuOverlay.jsx';

const ITEM_CLASS = [
  'font-display font-bold uppercase text-[length:var(--fs-micro)] tracking-[0.08em] whitespace-nowrap',
  '[transition:opacity_200ms_linear]',
  '[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-[.65]',
  'focus-visible:[outline:2px_solid_var(--red)]',
  'focus-visible:[outline-offset:2px]',
].join(' ');

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className="site-header fixed z-50"
      style={{
        top: 'calc(var(--top-header) + env(safe-area-inset-top))',
        left: 'var(--pad-header)',
      }}
    >
      <div className="glass flex items-center gap-[14px] rounded-full px-[18px] py-[10px]">
        <Link href="/" className={ITEM_CLASS}>
          KENNEMATIC
        </Link>
        <span aria-hidden="true" className="h-[12px] w-px bg-white/25" />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={`${ITEM_CLASS} cursor-pointer border-0 bg-transparent p-0 text-white`}
        >
          Menu
        </button>
      </div>
      {/* The exit, mirrored on the right. Hidden while the menu is open —
          the overlay puts its own Close in exactly this slot. */}
      {!menuOpen && <CloseButton />}
      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
