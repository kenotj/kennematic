'use client';

/* KENNEMATIC — the contact moment.
 *
 * Same rise contract as About.jsx, but with NO out ramp: it rises in over
 * CONTACT_IN [0.955, 0.985] while the wordmark is re-entering at the bottom,
 * then holds — the page's rest state is wordmark + contact. The wordmark owns
 * the bottom of the viewport and the header the top, so this block sits at
 * viewport centre. Chrome is pointer-events-none; only the anchors opt in.
 */

import { useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { usePlate } from '../lib/plate.jsx';
import { CONTACT_IN, CONTACT_EMAIL } from '../lib/constants.js';
import { expoOut, norm, r3, quantize } from '../lib/easing.js';

const RISE_Y = 2; // em
const RISE_BLUR = 5; // px
const BLUR_STEP = 0.25; // px

/* Empty for now — Instagram is hidden until it is ready to be shown:
   { label: 'Instagram', href: 'https://www.instagram.com/kennematic' }

   Still a list, and the row still gaps, so putting that entry back (or adding
   a second profile) is a one-line change and the row returns with it. */
const SOCIALS = [];

const LINK_CLASS = [
  'pointer-events-auto underline',
  '[transition:opacity_200ms_linear]',
  '[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-[.65]',
  'focus-visible:outline-2 focus-visible:outline-red focus-visible:outline-offset-4',
].join(' ');

export default function Contact() {
  const { progress, reduced } = usePlate();

  /* rise in, then hold — there is intentionally no out ramp */
  const inV = useTransform(progress, (p) => {
    let e;
    if (p < CONTACT_IN[0]) e = 0;
    else if (p < CONTACT_IN[1]) e = expoOut(norm(p, CONTACT_IN[0], CONTACT_IN[1]));
    else e = 1;
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
      className="contact absolute right-0 left-0 flex flex-col items-center gap-[0.8em] px-page text-center font-body text-ui font-medium motion-reduce:!transform-none motion-reduce:!filter-none"
      style={{
        top: '38%',
        opacity: inV,
        transform,
        filter,
        visibility,
      }}
    >
      <p className="m-0 text-micro uppercase opacity-70">
        Let&apos;s make something move
      </p>
      <a href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASS}>
        {CONTACT_EMAIL}
      </a>
      {/* Gated on the list rather than left to render empty: this row is a
          flex child of a column with gap-[0.8em], so an empty div would still
          push that gap under the email address and leave the block sitting
          visibly off its 38% centre. */}
      {SOCIALS.length > 0 && (
        <div className="flex gap-[1.5em] text-micro uppercase">
          {SOCIALS.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className={LINK_CLASS}>
              {s.label}
            </a>
          ))}
        </div>
      )}
    </motion.div>
  );
}
