'use client';

/* PLATE® — the logo lockup and its 3D exit.
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
import { motion, useTransform } from 'framer-motion';

import { usePlate } from '../lib/plate.jsx';
import { titleOut, titleIn } from '../lib/constants.js';
import { norm, r3, quantize } from '../lib/easing.js';

const EXIT_Z = 680; // px
const EXIT_BLUR = 8; // px
const BLUR_STEP = 0.25; // px

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
      <p className="title__tag font-body font-normal text-ui uppercase text-center">
        Creative AI Film Studio
      </p>
      {/* NO whitespace inside the <h1>: any text node between PL / A / TE®
          would hand the line a word-break opportunity. Keep it on one line. */}
      {/* eslint-disable-next-line */}
      <h1 className="title__mark font-display font-normal text-display whitespace-nowrap">PL<span className="title__script font-script" style={{ lineHeight: 0 }}>A</span>TE&reg;</h1>
    </motion.div>
  );
}