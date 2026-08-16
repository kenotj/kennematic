'use client';

/* KENNEMATIC — the one hover treatment for interactive surfaces.
 *
 * White floods across the element and the type inverts to black.
 *
 * A clip-path front (however curved) always reads as a wipe, because a wipe is
 * exactly what it is: one rigid shape sweeping a fixed profile across the box.
 * Liquid reads as liquid because its leading edge is not one shape — it bulges,
 * it runs ahead of itself in places, and it settles back.
 *
 * So the fill is built as METABALLS instead:
 *
 *   - a body rectangle that scales out from the entry edge, plus
 *   - three droplets that race ahead of it on their own springs, at three
 *     heights and three sizes, and
 *   - an SVG goo filter over the group (blur, then a hard alpha contrast)
 *     which fuses anything close together into one surface.
 *
 * The filter is what does the work: where a droplet nears the body, the blurred
 * alpha between them crosses the contrast threshold and they snap into a single
 * blob with a meniscus between them. The springs are underdamped, so the front
 * surges past its target and settles — the body catching up to the droplets is
 * the whole illusion. Nothing here is a keyframed shape; the edge is emergent.
 *
 * `from` picks the entry edge — "left" for things that read left-to-right,
 * "right" for the trailing half of a split control (see the nav pill, where
 * each half fills back toward its own outer edge).
 *
 * Usage — the host owns the gesture and the variant names, so one
 * `whileHover="hover"` drives the fill, the ink and anything else nested:
 *
 *   <motion.span initial="rest" animate="rest" whileHover="hover"
 *                className="relative overflow-hidden">
 *     <LiquidFill from="left" />
 *     <motion.span className="relative" variants={liquidInk}>label</motion.span>
 *   </motion.span>
 *
 * The fill paints at inset-0 with no z-index, so content must establish its own
 * stacking (`relative`) to sit above it, and the host MUST clip
 * (`overflow-hidden`): the droplets overshoot past the far edge by design.
 */

import { motion, useReducedMotion } from 'framer-motion';

export const LIQUID_INK_TRANSITION = { duration: 0.35, ease: [0.16, 1, 0.3, 1] };

/* Filter ids defined by <LiquidDefs /> in the root layout. The goo blur is in
   user units, so a single radius can't serve a 36px nav pill and a 250px card
   — too small and nothing fuses, too large and the whole fill rounds off into
   a pill. Hence two sizes; `scale` picks one. */
const GOO = { sm: 'url(#liquid-goo-sm)', lg: 'url(#liquid-goo-lg)' };

/* Underdamped on purpose — the overshoot is the surge, the settle is the
   liquid finding its level. Each droplet gets its own stiffness and delay so
   the three fronts never arrive together and the edge stays uneven. */
const BODY_SPRING = { type: 'spring', stiffness: 130, damping: 19 };
const DROPLETS = [
  { top: '30%', size: '78%', stiffness: 95, damping: 14, delay: 0 },
  { top: '62%', size: '96%', stiffness: 145, damping: 16, delay: 0.05 },
  { top: '46%', size: '58%', stiffness: 115, damping: 13, delay: 0.02 },
];

/* Ink flips a touch faster than the flood so it never lags behind the edge. */
export const liquidInk = {
  rest: { color: 'rgb(255,255,255)' },
  hover: { color: 'rgb(0,0,0)' },
  tap: { color: 'rgb(0,0,0)' },
};

/* `tap` repeats `hover` in every variant here because framer resolves gestures
   by priority, not by union: once the host's whileTap is active the propagated
   label is "tap", and a child with no "tap" entry falls back to its `animate`
   value — the flood would drain under the press that triggers it. */
const variantsFor = (rest, active) => ({ rest, hover: active, tap: active });

/* A droplet is a full-width carrier with a circle pinned to its entry edge, so
   translating the carrier by 100% walks the circle the parent's full width —
   framer resolves percentage x against the element's OWN box, and only the
   carrier is guaranteed to match the parent.
 *
 * The circle is offset a FULL width past the entry edge (not half), so at rest
 * it sits completely outside the host: at rest the element must be visibly
 * empty, and a centre-pinned circle would leave a bulge of white showing
 * through with nothing hovered. That offset also means the circle's leading
 * edge — not its centre — is what tracks the body's front, which is what makes
 * it read as the body bulging rather than a ball rolling ahead of it. */
function Droplet({ from, top, size, stiffness, damping, delay }) {
  const sign = from === 'right' ? -1 : 1;

  return (
    <motion.span
      className="absolute inset-y-0 left-0 w-full"
      variants={variantsFor({ x: '0%' }, { x: `${sign * 100}%` })}
      transition={{ type: 'spring', stiffness, damping, delay }}
    >
      <span
        className={`absolute aspect-square -translate-y-1/2 rounded-full bg-white ${
          from === 'right' ? 'right-0 translate-x-full' : 'left-0 -translate-x-full'
        }`}
        style={{ top, height: size }}
      />
    </motion.span>
  );
}

export function LiquidFill({ from = 'left', scale = 'lg', className = '' }) {
  /* Under reduced motion the hovered state still has to be legible, so the
     fill snaps to full rather than being dropped — it's the travel across the
     element that's the motion, not the change of colour. The goo filter and
     the droplets are pure animation, so they go entirely. */
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <motion.span
        aria-hidden="true"
        className={`absolute inset-0 bg-white ${className}`}
        variants={variantsFor({ opacity: 0 }, { opacity: 1 })}
        transition={{ duration: 0 }}
      />
    );
  }

  return (
    /* Bled past the top, bottom and entry edges because the goo threshold
       erodes the outline it fuses: without the bleed the fill would look
       inset and soft-cornered against the host's own edges. The far edge is
       NOT bled — that side is the leading edge, and it should be organic. */
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute -top-[30%] -bottom-[30%] ${
        from === 'right' ? '-right-[12%] left-0' : '-left-[12%] right-0'
      } ${className}`}
      style={{ filter: GOO[scale] }}
    >
      <motion.span
        className="absolute inset-0 bg-white"
        style={{ originX: from === 'right' ? 1 : 0 }}
        variants={variantsFor({ scaleX: 0 }, { scaleX: 1 })}
        transition={BODY_SPRING}
      />
      {DROPLETS.map((d) => (
        <Droplet key={d.top} from={from} {...d} />
      ))}
    </span>
  );
}

/* Render once, at the root. Two goo filters differing only in blur radius:
   blur the alpha, then push it through a steep contrast so near-touching
   shapes fuse into one silhouette instead of overlapping softly. The matrix
   row is alpha only — 20x gain with a -9 bias turns the blur's soft ramp into
   a hard edge at roughly 45% coverage. */
export function LiquidDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', pointerEvents: 'none' }}
    >
      <defs>
        {[
          ['liquid-goo-sm', 4],
          ['liquid-goo-lg', 10],
        ].map(([id, deviation]) => (
          <filter key={id} id={id} colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={deviation} result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
            />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

export default LiquidFill;
