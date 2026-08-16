'use client';

/* PLATE® — the three counters.
 *
 * They reuse Title's exit-3d contract, but with --exit-z 464px rather than
 * 680px. That is measured, not arbitrary: the stat block sits 81px lower in the
 * viewport than the logo, so under the same 1200px perspective a 680px Z push
 * would read as a noticeably bigger, faster departure. 464px is the value at
 * which the arrival/departure matches the logo's. Do not "simplify" it.
 *
 * Timing: back-to-back slots from STAT_FROM (0.74) up to titleIn (~0.9167),
 * no overlap, slot = (titleIn - STAT_FROM) / 3. Inside its own slot a stat
 * arrives over STAT_IN, holds over STAT_HOLD, then leaves over the remainder;
 * outside its slot it sits parked at exit 1. Net effect: the logo's own move,
 * performed three times, and then the logo itself.
 *
 * `is-gone` ships in the INITIAL markup so that with JS disabled the three
 * counters are hidden rather than stacked on top of one another.
 */

import { useEffect, useRef } from 'react';
import { motion, useTransform } from 'framer-motion';

import { usePlate } from '../lib/plate.jsx';
import { STAT_FROM, STAT_IN, STAT_HOLD, titleIn, STATS } from '../lib/constants.js';
import { norm, r3, quantize } from '../lib/easing.js';

const EXIT_Z = 464; // px — measured against the logo's 680px, see above
const EXIT_BLUR = 8; // px
const BLUR_STEP = 0.25; // px

const SLOT = (titleIn - STAT_FROM) / STATS.length;
const EXIT_LEN = 1 - STAT_IN - STAT_HOLD;

function Stat({ index, label, num }) {
  const { progress, reduced } = usePlate();
  const ref = useRef(null);

  const exit = useTransform(progress, (p) => {
    const a = STAT_FROM + index * SLOT;
    const u = (p - a) / SLOT;
    let e;
    if (u <= 0 || u >= 1) e = 1;
    else if (u < STAT_IN) e = 1 - norm(u, 0, STAT_IN);
    else if (u < STAT_IN + STAT_HOLD) e = 0;
    else e = norm(u, STAT_IN + STAT_HOLD, STAT_IN + STAT_HOLD + EXIT_LEN);
    return r3(e);
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
    <motion.dl
      ref={ref}
      data-stat=""
      className="stat exit-3d is-gone absolute left-0 right-0 flex flex-col items-center justify-end"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom) + max(12px,2.0921vh))',
        gap: 'var(--gap-title)',
        z,
        opacity,
        filter,
        visibility,
      }}
    >
      <dt className="stat__label font-body text-ui uppercase">{label}</dt>
      {/* the parentheses are part of the copy, not decoration */}
      <dd className="stat__num font-script text-stat">{num}</dd>
    </motion.dl>
  );
}

export default function Stats() {
  return (
    <>
      {STATS.map((s, i) => (
        <Stat key={s.label} index={i} label={s.label} num={s.num} />
      ))}
    </>
  );
}