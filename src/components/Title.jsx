'use client';

/* KENNEMATIC — the logo lockup and its 3D exit.
 *
 * exit-3d contract (shared with Stats.jsx):
 *   transform : translateZ(exit * --exit-z)   ← stays LINEAR. The perspective
 *               projection on .chrome supplies all of the acceleration; easing
 *               the Z ramp double-eases the move and reads wrong.
 *   opacity   : 1 - exit²
 *   filter    : blur(exit² * --exit-blur) but ONLY while `.is-exiting`
 *               (exit > 0), and `none` once `.is-gone` (exit >= 1).
 *
 * PERF: the blur is quantised to 0.25px steps before it is written. This is a
 * ~200px, full-bleed text block; letting the raw float through means a fresh
 * blur pass every single frame, where the quantised value lets the browser
 * skip the repaint whenever it has not actually moved a visible amount.
 */

import { useEffect, useRef } from 'react';
import { animate, motion, stagger, useTransform } from 'framer-motion';

import { usePlate } from '../lib/plate.jsx';
import { titleOut, titleIn } from '../lib/constants.js';
import { norm, r3, quantize } from '../lib/easing.js';

const EXIT_Z = 680; // px
const EXIT_BLUR = 8; // px
const BLUR_STEP = 0.25; // px

const MARK = 'KENNEMATIC';
const EASE_EXPO = [0.16, 1, 0.3, 1];

export default function Title() {
  const { progress, reduced } = usePlate();
  const ref = useRef(null);

  /* linear ramp 0→1 over [0, titleOut], hold at 1, then 1→0 over [titleIn, 1].
     r3() is the "skip identical writes" guard — a MotionValue only notifies
     when the value actually changes, so rounding collapses the no-op frames. */
  const exit = useTransform(progress, (p) => {
    if (p <= titleOut) return r3(norm(p, 0, titleOut));
    if (p >= titleIn) return r3(1 - norm(p, titleIn, 1));
    return 1;
  });

  const z = useTransform(exit, (e) => (reduced ? 0 : e * EXIT_Z));
  const opacity = useTransform(exit, (e) => 1 - e * e);
  const filter = useTransform(exit, (e) => {
    if (reduced || e <= 0 || e >= 1) return 'none';
    return `blur(${quantize(e * e * EXIT_BLUR, BLUR_STEP)}px)`;
  });
  const visibility = useTransform(exit, (e) => (e >= 1 ? 'hidden' : 'visible'));

  /* Kinetic entrance: each letter rises in on its own beat, on top of the
   * whole-mark CSS fade/blur that `is-ready` drives. This runs client-side
   * only, AFTER hydration — the server HTML carries plain visible spans, so
   * with JS off the wordmark simply renders (no inline opacity:0 in the
   * markup). The letters are hidden here in the same tick they'd first paint,
   * and the parent is still at opacity 0 until fonts settle, so nothing
   * flashes. Reduced motion: skip entirely; the CSS fade already covers it. */
  useEffect(() => {
    if (reduced) return;
    const node = ref.current;
    if (!node) return;
    const letters = node.querySelectorAll('[data-letter]');
    const tag = node.querySelector('.title__tag');
    if (!letters.length) return;

    animate(letters, { opacity: 0, y: '0.35em' }, { duration: 0 });
    if (tag) animate(tag, { letterSpacing: '0.42em' }, { duration: 0 });

    let alive = true;
    const enter = () => {
      if (!alive) return;
      alive = false;
      animate(
        letters,
        { opacity: 1, y: '0em' },
        { delay: stagger(0.05), duration: 1.1, ease: EASE_EXPO }
      );
      if (tag) {
        animate(tag, { letterSpacing: '0.14em' }, { duration: 1.4, ease: EASE_EXPO });
      }
    };
    /* same gate + fallback shape as plate.jsx's entrance */
    if (document.fonts?.ready) document.fonts.ready.then(enter);
    else enter();
    const t = setTimeout(enter, 2600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [reduced]);

  /* class bookkeeping only — imperative, so it never triggers a re-render */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let prevExiting = null;
    let prevGone = null;
    const apply = (e) => {
      const exiting = e > 0;
      const gone = e >= 1;
      if (exiting !== prevExiting) {
        prevExiting = exiting;
        node.classList.toggle('is-exiting', exiting);
      }
      if (gone !== prevGone) {
        prevGone = gone;
        node.classList.toggle('is-gone', gone);
      }
    };
    apply(exit.get());
    return exit.on('change', apply);
  }, [exit]);

  return (
    <motion.div
      ref={ref}
      className="title exit-3d absolute left-0 right-0 flex flex-col items-center justify-end"
      style={{
        bottom: 'env(safe-area-inset-bottom)',
        gap: 'var(--gap-title)',
        z,
        opacity,
        filter,
        visibility,
      }}
    >
      <p className="title__tag font-body font-normal text-ui uppercase text-center tracking-[0.14em]">
        AI Film &amp; Advert Direction
      </p>
      {/* Letters are aria-hidden spans (the h1 carries the accessible name);
          inline-block so each can translate. No whitespace between them, and
          whitespace-nowrap stays as the guard against any wrap/clip surprise. */}
      <h1
        className="title__mark font-display font-extrabold tracking-[-0.02em] text-display whitespace-nowrap"
        aria-label={MARK}
      >
        {MARK.split('').map((ch, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} data-letter="" aria-hidden="true" className="inline-block">
            {ch}
          </span>
        ))}
      </h1>
    </motion.div>
  );
}