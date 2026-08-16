'use client';

/* KENNEMATIC — the contact moment.
 *
 * Same rise contract as About.jsx, but with NO out ramp: it rises in over
 * CONTACT_IN [0.955, 0.985] while the wordmark is re-entering at the bottom,
 * then holds — the page's rest state is wordmark + contact. The wordmark owns
 * the bottom of the viewport and the header the top, so this block sits at
 * viewport centre. Chrome is pointer-events-none; only the anchors opt in.
 */

import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { usePlate } from '../lib/plate.jsx';
import { CONTACT_IN, CONTACT_EMAIL } from '../lib/constants.js';
import { expoOut, norm, r3, quantize } from '../lib/easing.js';

const RISE_Y = 2; // em
const RISE_BLUR = 5; // px
const BLUR_STEP = 0.25; // px

/* Placeholder socials — swap hrefs for real profiles. */
const SOCIALS = [
  { label: 'Instagram', href: 'https://instagram.com' },
  { label: 'Vimeo', href: 'https://vimeo.com' },
  { label: 'LinkedIn', href: 'https://linkedin.com' },
];

const LINK_CLASS = [
  'pointer-events-auto underline',
  '[transition:opacity_200ms_linear]',
  '[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-[.65]',
  'focus-visible:[outline:2px_solid_var(--red)]',
  'focus-visible:[outline-offset:4px]',
].join(' ');

export default function Contact() {
  const { progress, reduced } = usePlate();
  const ref = useRef(null);

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

  /* class bookkeeping only — imperative, so it never triggers a re-render */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let prevAnim = null;
    let prevHidden = null;
    const apply = (v) => {
      const anim = v > 0 && v < 1;
      const hidden = v <= 0;
      if (anim !== prevAnim) {
        prevAnim = anim;
        node.classList.toggle('is-anim', anim);
      }
      if (hidden !== prevHidden) {
        prevHidden = hidden;
        node.classList.toggle('is-hidden', hidden);
      }
    };
    apply(inV.get());
    return inV.on('change', apply);
  }, [inV]);

  return (
    <motion.div
      ref={ref}
      className="contact rise absolute left-0 right-0 flex flex-col items-center gap-[0.8em] font-body font-medium text-ui text-center"
      style={{
        top: '38%',
        opacity: inV,
        '--in': inV,
        transform,
        filter,
        visibility,
      }}
    >
      <p className="m-0 uppercase text-[length:var(--fs-micro)] opacity-70">
        Let&apos;s make something move
      </p>
      <a href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASS}>
        {CONTACT_EMAIL}
      </a>
      <div className="flex gap-[1.5em] text-[length:var(--fs-micro)] uppercase">
        {SOCIALS.map((s) => (
          <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className={LINK_CLASS}>
            {s.label}
          </a>
        ))}
      </div>
    </motion.div>
  );
}
