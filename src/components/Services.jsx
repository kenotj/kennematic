'use client';

/* KENNEMATIC — the services strip.
 *
 * Same rise contract as About.jsx (opacity, translateY in em, squared blur
 * during the ramp, hidden once in <= 0) — see that file for the why of
 * each piece. Timing lives in SERVICES_IN / SERVICES_OUT: the dead window
 * between the title's exit (~0.083) and About's entrance (0.18), so it shares
 * About's screen position without ever coexisting with it.
 */

import { useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { usePlate } from '../lib/plate.jsx';
import { SERVICES, SERVICES_IN, SERVICES_OUT } from '../lib/constants.js';
import { expoOut, norm, r3, quantize } from '../lib/easing.js';

const RISE_Y = 2; // em
const RISE_BLUR = 5; // px
const BLUR_STEP = 0.25; // px

/* Names only here — the blurbs belong to the pinned services block in
   Works.jsx. Both read the same list so they can't drift apart. */

export default function Services() {
  const { progress, reduced } = usePlate();

  const inV = useTransform(progress, (p) => {
    let e;
    if (p < SERVICES_IN[0]) e = 0;
    else if (p < SERVICES_IN[1]) e = expoOut(norm(p, SERVICES_IN[0], SERVICES_IN[1]));
    else if (p < SERVICES_OUT[0]) e = 1;
    else if (p < SERVICES_OUT[1]) e = 1 - expoOut(norm(p, SERVICES_OUT[0], SERVICES_OUT[1]));
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
    <motion.div
      className="services absolute right-page left-page bottom-[max(16px,6.9038vh)] font-body text-ui font-medium motion-reduce:!transform-none motion-reduce:!filter-none sm:right-auto sm:w-[46.0544vw]"
      style={{
        opacity: inV,
        transform,
        filter,
        visibility,
      }}
    >
      <p className="m-0 text-micro uppercase opacity-70">What I do</p>
      <ul className="m-0 mt-[0.6em] list-none p-0 leading-[150%]">
        {SERVICES.map((s) => (
          <li key={s.name}>{s.name}</li>
        ))}
      </ul>
    </motion.div>
  );
}
