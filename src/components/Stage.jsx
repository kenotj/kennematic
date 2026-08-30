'use client';

/* PLATE® — layer 0. The base plate, full-bleed and fixed behind everything.
 *
 * Ported from legacy `.stage` (style.css) + the stage half of `updateReveals`.
 * Opacity is `1 - stageOut`, where stageOut ramps across FADE_A (0.93 → 0.98)
 * of reveal A's OWN 0→1 progress — black replaces black exactly as A finishes,
 * so the hand-off is invisible. `.is-covered` hides the layer outright once A
 * is fully open.
 */

import { useEffect, useRef } from 'react';
import { motion, useTransform } from 'framer-motion';

import { useScrub, useRevealValue } from '../lib/useScrub.js';
import { norm, r3 } from '../lib/easing.js';
import { A, FADE_A, VIDEO_SRC } from '../lib/constants.js';

export default function Stage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rootRef = useRef(null);

  const revealA = useRevealValue(A);
  useScrub(0, { videoRef, canvasRef });

  /* opacity: calc(1 - var(--stage-out)) */
  const opacity = useTransform(revealA, (ra) => 1 - r3(norm(ra, FADE_A[0], FADE_A[1])));

  /* .is-covered when reveal A is fully open */
  useEffect(() => {
    const apply = (ra) => {
      const el = rootRef.current;
      if (el) el.classList.toggle('is-covered', ra >= 1);
    };
    apply(revealA.get());
    return revealA.on('change', apply);
  }, [revealA]);

  return (
    <motion.div
      ref={rootRef}
      className="stage fixed inset-0 z-0 [&.is-covered]:invisible"
      style={{ opacity }}
    >
      <video
        ref={videoRef}
        id="v1"
        src={VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-240 ease-linear [&.is-live]:opacity-100 motion-reduce:transition-none"
        id="c1"
        width={1280}
        height={720}
      />
    </motion.div>
  );
}
