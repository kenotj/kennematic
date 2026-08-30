'use client';

/* KENNEMATIC — the about paragraph.
 *
 * rise contract:
 *   opacity   : in
 *   transform : translateY((1 - in) * --rise-y)   with --rise-y = 2em
 *   filter    : blur((1 - in)² * 5px) while 0 < in < 1  ← SQUARED
 *   visibility:hidden once in <= 0
 *
 * The rise distance is 2*em*, i.e. relative to this element's own --fs-ui font
 * size, so it cannot be expressed as framer-motion's numeric `y` (px). The
 * transform itself is therefore a MotionValue that emits em units, keeping
 * ownership with framer-motion while preserving the legacy geometry.
 */

import { useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { usePlate } from '../lib/plate.jsx';
import { ABOUT_IN, ABOUT_OUT } from '../lib/constants.js';
import { expoOut, norm, r3, quantize } from '../lib/easing.js';

const RISE_Y = 2; // em
const RISE_BLUR = 5; // px
const BLUR_STEP = 0.25; // px

const COPY =
  'AI-made, human-directed. I direct films and advert content built with generative video — where taste, timing and the edit still decide everything.';

export default function About() {
  const { progress, reduced } = usePlate();

  const inV = useTransform(progress, (p) => {
    let e;
    if (p < ABOUT_IN[0]) e = 0;
    else if (p < ABOUT_IN[1]) e = expoOut(norm(p, ABOUT_IN[0], ABOUT_IN[1]));
    else if (p < ABOUT_OUT[0]) e = 1;
    else if (p < ABOUT_OUT[1]) e = 1 - expoOut(norm(p, ABOUT_OUT[0], ABOUT_OUT[1]));
    else e = 0;
    return r3(e);
  });

  const filter = useTransform(inV, (v) => {
    if (reduced || v <= 0 || v >= 1) return 'none';
    const d = 1 - v;
    return `blur(${quantize(d * d * RISE_BLUR, BLUR_STEP)}px)`;
  });
  const visibility = useTransform(inV, (v) => (v <= 0 ? 'hidden' : 'visible'));
  const reducedV = useMotionValue(0);
  const transform = useTransform([inV, reducedV], ([v, prefersReduced]) =>
    prefersReduced ? 'none' : `translateY(${r3((1 - v) * RISE_Y)}em)`
  );

  useEffect(() => {
    reducedV.set(reduced ? 1 : 0);
  }, [reduced, reducedV]);

  return (
    <motion.p
      className="about absolute right-page left-page bottom-[max(16px,6.9038vh)] font-body text-ui font-medium motion-reduce:!transform-none motion-reduce:!filter-none sm:right-auto sm:w-[46.0544vw]"
      style={{
        opacity: inV,
        transform,
        filter,
        visibility,
      }}
    >
      {COPY}
    </motion.p>
  );
}
