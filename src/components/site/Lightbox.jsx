'use client';

/* KENNEMATIC — image lightbox for the case-study pages.
 *
 * On the page every image is cropped to a fixed aspect ratio with object-cover,
 * which is what keeps the grid tidy but also means nobody ever sees the whole
 * frame. Clicking one opens it here at object-contain, so the expanded view is
 * the real image rather than a bigger crop of it.
 *
 * Two exports, because the page that uses them is a server component:
 *
 *   LightboxProvider — wraps the page, owns the overlay, and takes the ordered
 *     image list as a prop. Passing the list in (rather than having triggers
 *     register themselves on mount) keeps prev/next in the page's reading
 *     order instead of whatever order effects happen to fire in.
 *   LightboxTrigger — the button each image sits inside.
 *
 * Videos are deliberately NOT wired up: they carry native controls, and a
 * click on them means play, not zoom.
 *
 * Sits at z-[70], above the menu overlay's z-[60], so opening one over the
 * other can never trap the viewer under a sheet they can't see to dismiss.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { LiquidFill, liquidInk, LIQUID_INK_TRANSITION } from './liquidHover.jsx';

const LightboxContext = createContext(null);

/* Same glass recipe and liquid hover as the nav pill and the menu's Close, so
   the controls read as part of the same family. */
const CONTROL_CLASS = [
  'glass absolute z-10 overflow-hidden rounded-full',
  'flex items-center justify-center',
  'cursor-pointer border-0 text-white',
  'focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-red',
].join(' ');

const CONTROL_MOTION = { initial: 'rest', animate: 'rest', whileHover: 'hover', whileTap: 'tap' };

function Chevron({ back = false }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="h-[1em] w-[1em]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={back ? undefined : { transform: 'scaleX(-1)' }}
    >
      <path d="M7.5 1.5 L3 6 L7.5 10.5" />
    </svg>
  );
}

export function LightboxTrigger({ url, label, children }) {
  const ctx = useContext(LightboxContext);
  if (!ctx) return children;
  return (
    <button
      type="button"
      onClick={(e) => ctx.open(url, e.currentTarget)}
      aria-label={label ? `Expand image: ${label}` : 'Expand image'}
      /* The zoom cursor and the slow drift on hover are the only hints that
         the frame is interactive — there is no overlay chrome to give it away. */
      className="block h-full w-full cursor-zoom-in border-0 bg-transparent p-0 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-red [&>img]:transition-transform [&>img]:duration-[600ms] [&>img]:ease-expo hover:[&>img]:scale-[1.03]"
    >
      {children}
    </button>
  );
}

export function LightboxProvider({ items = [], children }) {
  const [index, setIndex] = useState(-1);
  const reduced = useReducedMotion();
  /* Whatever opened the overlay, so focus goes back there on close instead of
     to the top of the document. */
  const openerRef = useRef(null);

  const open = useCallback(
    (url, el) => {
      const at = items.findIndex((m) => m.url === url);
      if (at < 0) return;
      openerRef.current = el ?? null;
      setIndex(at);
    },
    [items],
  );

  const close = useCallback(() => {
    setIndex(-1);
    const el = openerRef.current;
    openerRef.current = null;
    if (el?.isConnected) el.focus({ preventScroll: true });
  }, []);

  const step = useCallback(
    (delta) => setIndex((i) => (i < 0 ? i : (i + delta + items.length) % items.length)),
    [items.length],
  );

  const isOpen = index >= 0 && index < items.length;

  /* Keys and the scroll lock only exist while the overlay does. Restoring the
     previous overflow rather than clearing it keeps this from stomping on any
     lock a parent may already hold. */
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close, step]);

  const value = useMemo(() => ({ open }), [open]);
  const current = isOpen ? items[index] : null;
  const many = items.length > 1;

  return (
    <LightboxContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {current && (
          <motion.div
            className="fixed inset-0 z-[70] bg-black/92 [backdrop-filter:blur(24px)_saturate(140%)] [-webkit-backdrop-filter:blur(24px)_saturate(140%)]"
            role="dialog"
            aria-modal="true"
            aria-label={current.label || 'Expanded image'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.28, ease: 'easeOut' }}
            /* Anywhere that is not a control or the image itself dismisses. */
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <motion.button
              {...CONTROL_MOTION}
              type="button"
              onClick={close}
              aria-label="Close expanded image"
              className={`${CONTROL_CLASS} top-[calc(var(--spacing-header-top)+env(safe-area-inset-top))] right-page size-11 text-micro`}
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
            </motion.button>

            {many && (
              <>
                <motion.button
                  {...CONTROL_MOTION}
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous image"
                  className={`${CONTROL_CLASS} top-1/2 left-page size-11 -translate-y-1/2 text-ui`}
                >
                  <LiquidFill from="left" scale="sm" />
                  <motion.span
                    className="relative block"
                    variants={liquidInk}
                    transition={LIQUID_INK_TRANSITION}
                  >
                    <Chevron back />
                  </motion.span>
                </motion.button>
                <motion.button
                  {...CONTROL_MOTION}
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next image"
                  className={`${CONTROL_CLASS} top-1/2 right-page size-11 -translate-y-1/2 text-ui`}
                >
                  <LiquidFill from="right" scale="sm" />
                  <motion.span
                    className="relative block"
                    variants={liquidInk}
                    transition={LIQUID_INK_TRANSITION}
                  >
                    <Chevron />
                  </motion.span>
                </motion.button>
              </>
            )}

            {/* The stage is its own click target for dismissal, so the dead
                space around a letterboxed image still closes the overlay.

                Padding is kept tight on purpose. An expanded 4:3 screenshot has
                to come out BIGGER than the ~65ch it occupies on the page, or
                the zoom is pointless — generous inset padding was quietly
                making it smaller. From md up the side padding clears the
                prev/next controls; below that they overlay the image edges,
                which costs less than squeezing the image on a phone. The extra
                bottom padding is the counter's slot. */}
            <div
              className="flex h-full w-full items-center justify-center px-page pt-[calc(var(--spacing-page)+10px)] pb-[calc(var(--spacing-page)+34px)] md:px-[calc(var(--spacing-page)*2+44px)]"
              onClick={(e) => {
                if (e.target === e.currentTarget) close();
              }}
            >
              <motion.img
                /* Keyed by url so stepping swaps the element and re-runs the
                   entrance, rather than silently retargeting the same node. */
                key={current.url}
                src={current.url}
                alt={current.label || ''}
                className="max-h-full max-w-full object-contain"
                initial={{ opacity: 0, scale: reduced ? 1 : 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            {many && (
              <p
                className="pointer-events-none absolute inset-x-0 bottom-page text-center text-micro tracking-[0.12em] opacity-55"
              >
                {index + 1} / {items.length}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </LightboxContext.Provider>
  );
}
