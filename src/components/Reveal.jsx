'use client';

/* PLATE® — the wipe layers. <Reveal variant="a" /> and <Reveal variant="b" />.
 *
 * Ported from legacy `.reveal` / `.reveal--a` / `.reveal--b` (style.css) and
 * the reveal half of `updateReveals` (main.js).
 *
 * GEOMETRY (unchanged from legacy):
 *   box    position:fixed; top:50%; left:50%;
 *          transform: translate(-50%,-50%) rotate(reveal * angle)
 *          overflow:hidden; background:#000; pointer-events:none
 *   media  100vw x 100vh, centred in the box, object-fit:cover, and
 *          counter-rotated by -(reveal * angle) so the picture stays upright
 *          and viewport-locked while the box opens.
 *   The box centre is the viewport centre at every reveal value, so the media
 *   centre is too: at reveal = 0.667 on variant a the media sits at exactly
 *   {x:0, y:0, w:innerWidth, h:innerHeight}.
 *
 * PERFORMANCE FIX — the box no longer animates `width`.
 *   Legacy: width: calc(var(--reveal) * var(--span-w)) → a layout + full
 *   repaint of a viewport-sized video on every single frame.
 *   Here: the box is ALWAYS var(--span-w) wide and the opening is cut with
 *   clip-path: inset(0 P% 0 P%), P = (1 - reveal) * 50.
 *   Equivalence: inset percentages resolve against the border box, so the
 *   visible width is (1 - 2P/100) * spanW = reveal * spanW, centred on the box
 *   centre — the same hard edge growing symmetrically from the middle. The
 *   clip lives in the element's local (pre-transform) space, exactly like the
 *   old `overflow:hidden` edge did. At reveal = 0 the box is fully clipped; at
 *   reveal = 1 it is fully open. Because the box is now always full-span, its
 *   centre no longer moves with reveal — but it never did: translate(-50%,-50%)
 *   pinned it to the viewport centre at every width. Rotation origin, media
 *   centring and counter-rotation are therefore all bit-identical.
 *   clip-path + transform are GPU-composited: no layout, no repaint.
 */

import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { useScrub, useRevealValue } from '../lib/useScrub.js';
import { usePlate } from '../lib/plate.jsx';
import { clamp01, r3 } from '../lib/easing.js';
import { A, B, VIDEO_SRC } from '../lib/constants.js';

const VARIANTS = {
  a: {
    index: 1,
    zIndex: 5,
    angle: -45,
    spanW: 'calc(72vw + 72vh)',
    spanH: 'calc(72vw + 72vh)',
    videoId: 'v2',
    canvasId: 'c2',
    ariaHidden: true,
  },
  b: {
    index: 2,
    zIndex: 7,
    angle: 0,
    spanW: '102vw',
    spanH: '102vh',
    videoId: 'v3',
    canvasId: 'c3',
    ariaHidden: false,
  },
};

const MEDIA_STYLE = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: '100vw',
  height: '100vh',
  objectFit: 'cover',
};

const REDUCED_FADE = [0.45, 0.55];

export default function Reveal({ variant = 'a' }) {
  const cfg = VARIANTS[variant] || VARIANTS.a;
  const { reduced } = usePlate();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rootRef = useRef(null);

  const revealA = useRevealValue(A);
  const revealB = useRevealValue(B);
  const reveal = variant === 'a' ? revealA : revealB;
  const reducedV = useMotionValue(0);

  useScrub(cfg.index, { videoRef, canvasRef });

  useEffect(() => {
    reducedV.set(reduced ? 1 : 0);
  }, [reduced, reducedV]);

  /* --rot: reveal * angle — legacy quantises reveal to 3 decimals */
  const rotate = useTransform([reveal, reducedV], ([r, prefersReduced]) =>
    prefersReduced ? 0 : r3(r) * cfg.angle
  );
  const counterRotate = useTransform([reveal, reducedV], ([r, prefersReduced]) =>
    prefersReduced ? 0 : -r3(r) * cfg.angle
  );

  /* replaces width: calc(reveal * span-w) — see header note */
  const clipPath = useTransform([reveal, reducedV], ([r, prefersReduced]) => {
    if (prefersReduced) return 'inset(0 0% 0 0%)';
    const p = (1 - r3(r)) * 50;
    return `inset(0 ${p}% 0 ${p}%)`;
  });

  /* Reduced motion uses a short crossfade between static, unrotated scenes;
   * it never scrubs the rotating clip window across the viewport. */
  const opacity = useTransform([reveal, reducedV], ([r, prefersReduced]) => {
    if (!prefersReduced) return 1;
    return r3(clamp01((r - REDUCED_FADE[0]) / (REDUCED_FADE[1] - REDUCED_FADE[0])));
  });

  /* reveal A is hidden outright once reveal B has fully covered it */
  useEffect(() => {
    if (variant !== 'a') return undefined;
    const apply = (rb) => {
      const el = rootRef.current;
      if (el) el.classList.toggle('is-covered', rb >= 1);
    };
    apply(revealB.get());
    return revealB.on('change', apply);
  }, [variant, revealB]);

  return (
    <motion.div
      ref={rootRef}
      className={`reveal reveal--${variant}`}
      aria-hidden={cfg.ariaHidden ? 'true' : undefined}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        width: cfg.spanW,
        height: cfg.spanH,
        zIndex: cfg.zIndex,
        overflow: 'hidden',
        background: '#000',
        pointerEvents: 'none',
        willChange: 'clip-path, transform',
        x: '-50%',
        y: '-50%',
        rotate,
        clipPath,
        opacity,
      }}
    >
      <motion.video
        ref={videoRef}
        id={cfg.videoId}
        src={VIDEO_SRC}
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
        style={{ ...MEDIA_STYLE, x: '-50%', y: '-50%', rotate: counterRotate }}
      />
      <motion.canvas
        ref={canvasRef}
        className="plate"
        id={cfg.canvasId}
        width={1280}
        height={720}
        style={{ ...MEDIA_STYLE, x: '-50%', y: '-50%', rotate: counterRotate }}
      />
    </motion.div>
  );
}
