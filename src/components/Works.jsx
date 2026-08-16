'use client';

/* PLATE® — Works (sec2).
 *
 * Port of legacy `.sec2` + `updateSec2()`. Pixel-identical geometry, identical
 * motion curves. The two things that changed are implementation, not output:
 *
 *   1. The legacy loop read `el.offsetTop` / `el.offsetHeight` for every block
 *      on every animation frame, forcing a synchronous layout each frame. Here
 *      the blocks are registered with `metrics.registerBlocks()` and read from
 *      the CACHED `metrics.blocks` snapshot, which is refreshed once per resize.
 *   2. Nothing animated goes through React state. Every per-frame value is a
 *      MotionValue bound straight to `style`, so this component renders once.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { usePlate } from '../lib/plate.jsx';
import { clamp01, expoOut, easeIn, norm, r3, quantize } from '../lib/easing.js';
import {
  SEC2_SHOW,
  SEC2_RAMP,
  SEC2_ENTER,
  FLY,
  FLY_STEP,
  FLY_DUR,
  BAND_HL,
  BAND_TOP,
  BAND_BOT,
  WORKS_LEFT,
  WORKS_RIGHT,
} from '../lib/constants.js';

/* Blur is the most expensive thing on this page: it repaints text. Quantizing
   to a coarse step means most frames write a value byte-identical to the last
   one, and the browser skips the repaint entirely. */
const BLUR_STEP = 0.25;
const TITLE_BLUR = 6; /* legacy: (1 - o)^2 * 6px */
const ROW_BLUR = 12; /* legacy: --fly-blur, fly^2 * 12px */
const FLY_X = 0.62; /* legacy: --fly-x, 62vw */

const blurCss = (px) => (px > 0 ? `blur(${px}px)` : 'none');

/* --------------------------------------------------------------------- row */

function Row({ item, side, index, progress, metrics, version, reduced, yearFirst }) {
  const ref = useRef(null);
  const dir = side === 'l' ? -1 : 1;

  /* raw fly amount 0..1 for this pair — shared shape for x / opacity / blur */
  const fly = useTransform(progress, (p) => {
    if (reduced) return 0;
    const u = norm(p, FLY[0], FLY[1]);
    return r3(easeIn(clamp01((u - index * FLY_STEP) / FLY_DUR)));
  });

  /* translateX(dir * fly * 62vw), resolved against the measured viewport so a
     resize re-solves it without a re-render (version is the resize tick). */
  const x = useTransform([fly, version], ([f]) => dir * f * FLY_X * metrics.vw);
  const opacity = useTransform(fly, (f) => r3(1 - f * f));
  const filter = useTransform(fly, (f) =>
    !reduced && f > 0 && f < 1 ? blurCss(quantize(f * f * ROW_BLUR, BLUR_STEP)) : 'none'
  );

  /* `.is-flying` is preserved for the reduced-motion stylesheet rule; the class
     flips at most twice per pass, so an imperative toggle costs nothing. */
  useEffect(() => {
    const apply = (f) => {
      const node = ref.current;
      if (node) node.classList.toggle('is-flying', f > 0 && f < 1);
    };
    apply(fly.get());
    return fly.on('change', apply);
  }, [fly]);

  const year = <span className="w-year text-[length:var(--fs-micro)] whitespace-nowrap">{item.year}</span>;

  return (
    <motion.div
      ref={ref}
      className="w-row flex flex-row items-baseline gap-[1.3605vw]"
      style={{ x, opacity, filter }}
    >
      {yearFirst && year}
      <span className="w-brand text-[length:var(--fs-ui)] underline whitespace-nowrap">
        {item.brand}
      </span>
      <span className="w-name text-[length:var(--fs-ui)] whitespace-nowrap">{item.name}</span>
      {!yearFirst && year}
    </motion.div>
  );
}

/* ------------------------------------------------------------------- works */

export default function Works() {
  const { progress, metrics, reduced } = usePlate();

  const rootRef = useRef(null);
  const titleRef = useRef(null);
  const desc1Ref = useRef(null);
  const listRef = useRef(null);
  const desc2Ref = useRef(null);

  /* Resize tick. metrics is mutated in place, so MotionValues that depend on
     geometry need something to re-fire on; bumping this drives them all. */
  const version = useMotionValue(0);

  useLayoutEffect(() => {
    /* subscribe BEFORE registering — registerBlocks() measures synchronously,
       and we want that first measurement to reach our transforms. */
    const unsubscribe = metrics.subscribe(() => version.set(version.get() + 1));
    const unregister = metrics.registerBlocks({
      title: titleRef,
      desc1: desc1Ref,
      list: listRef,
      desc2: desc2Ref,
    });
    return () => {
      if (typeof unregister === 'function') unregister();
      unsubscribe();
    };
  }, [metrics, version]);

  /* Web fonts land after first paint and change every block height. Re-measure
     once they settle so the cached offsets are the real ones. */
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return;
    let alive = true;
    document.fonts.ready.then(() => {
      if (alive && typeof metrics.measure === 'function') metrics.measure();
    });
    return () => {
      alive = false;
    };
  }, [metrics]);

  /* ------------------------------------------------------------- strip y */

  const s2y = useTransform([progress, version], ([p]) => {
    if (reduced) return metrics.s2Pin;
    const t = clamp01(norm(p, SEC2_RAMP[0], SEC2_RAMP[1]));
    return r3(metrics.s2Start + (metrics.s2Pin - metrics.s2Start) * t);
  });

  /* ---------------------------------------------------- visibility gate */

  const visibility = useTransform(progress, (p) =>
    p >= SEC2_SHOW[0] && p <= SEC2_SHOW[1] ? 'visible' : 'hidden'
  );

  useEffect(() => {
    const apply = (v) => {
      const node = rootRef.current;
      if (node) node.classList.toggle('is-hidden', v === 'hidden');
    };
    apply(visibility.get());
    return visibility.on('change', apply);
  }, [visibility]);

  /* ------------------------------------------------- per-block opacity */

  /* The legacy "reading band": a block is lit only while it sits inside a
     window of the viewport. top/bottom are its position IN THE VIEWPORT, i.e.
     cached offset + current strip translation — no layout read. */
  const band = useMemo(() => {
    return (key, s2yPx) => {
      const b = metrics.blocks[key];
      const top = b.top + s2yPx;
      const bottom = top + b.height;
      return clamp01(
        Math.min(
          expoOut(clamp01((top - BAND_HL) / BAND_TOP)),
          expoOut(clamp01((metrics.vh - bottom) / BAND_BOT))
        )
      );
    };
  }, [metrics]);

  const desc1Opacity = useTransform([s2y, version], ([y]) => r3(band('desc1', y)));
  const listOpacity = useTransform([s2y, version], ([y]) => r3(band('list', y)));
  const desc2Opacity = useTransform([s2y, version], ([y]) => r3(band('desc2', y)));

  /* Title carries the extra SEC2_ENTER fade on top of the band. */
  const titleRaw = useTransform([s2y, progress, version], ([y, p]) =>
    clamp01(band('title', y) * expoOut(norm(p, SEC2_ENTER[0], SEC2_ENTER[1])))
  );
  const titleOpacity = useTransform(titleRaw, r3);
  const titleFilter = useTransform(titleRaw, (o) =>
    !reduced && o > 0 && o < 1
      ? blurCss(quantize((1 - o) * (1 - o) * TITLE_BLUR, BLUR_STEP))
      : 'none'
  );

  useEffect(() => {
    const apply = (o) => {
      const node = titleRef.current;
      if (node) node.classList.toggle('is-entering', o > 0 && o < 1);
    };
    apply(titleRaw.get());
    return titleRaw.on('change', apply);
  }, [titleRaw]);

  /* ------------------------------------------------------------- render */

  return (
    <motion.div
      ref={rootRef}
      id="sec2"
      aria-hidden="true"
      className="sec2 is-hidden fixed inset-0 z-[6] overflow-hidden pointer-events-none font-medium [font-family:'Inter_Tight',sans-serif]"
      style={{ visibility }}
    >
      <motion.div
        id="strip"
        className="strip absolute top-0 left-0 w-[100vw] will-change-transform"
        style={{ y: s2y }}
      >
        <motion.div
          ref={titleRef}
          data-block=""
          className="w-title absolute left-[3.5374vw] top-[22.9252vw] w-[38.3673vw] flex flex-col gap-[1.6327vw]"
          style={{ opacity: titleOpacity, filter: titleFilter }}
        >
          <p className="w-eyebrow text-[length:var(--fs-micro)] uppercase leading-[100%]">
            Selected work
          </p>
          <h2 className="w-mark [font-family:'BBH_Bartle',sans-serif] font-normal text-[length:var(--fs-work)] leading-[100%]">
            Built false, shot{' '}
            <span className="w-script [font-family:'Alex_Brush',cursive] leading-[0]">(true)</span>
            &reg;
          </h2>
        </motion.div>

        <motion.p
          ref={desc1Ref}
          data-block=""
          className="w-desc1 absolute left-[50%] top-[58.7755vw] w-[calc(50%-var(--pad-header))] text-[length:var(--fs-ui)] leading-[100%]"
          style={{ opacity: desc1Opacity }}
        >
          Every scene starts as a plate. We light it, shoot it, keep what the lens kept. The only
          effect is that you cannot find one.
        </motion.p>

        <motion.div
          ref={listRef}
          data-block=""
          className="w-list absolute top-[110.2041vw] left-[50%] w-[64.2857vw] -translate-x-1/2 flex flex-row gap-[2.7211vw]"
          style={{ opacity: listOpacity }}
        >
          <div className="w-col w-col--l flex flex-col gap-[2.6531vw] w-[32.7891vw] items-end text-right">
            {WORKS_LEFT.map((item, i) => (
              <Row
                key={item.brand}
                item={item}
                side="l"
                index={i}
                yearFirst
                progress={progress}
                metrics={metrics}
                version={version}
                reduced={reduced}
              />
            ))}
          </div>
          <div className="w-col w-col--r flex flex-col gap-[2.6531vw] w-[28.7755vw] items-start">
            {WORKS_RIGHT.map((item, i) => (
              <Row
                key={item.brand}
                item={item}
                side="r"
                index={i}
                yearFirst={false}
                progress={progress}
                metrics={metrics}
                version={version}
                reduced={reduced}
              />
            ))}
          </div>
        </motion.div>

        <motion.p
          ref={desc2Ref}
          data-block=""
          className="w-desc2 absolute top-[125.8503vw] left-[50%] w-[38.2993vw] -translate-x-1/2 text-[length:var(--fs-micro)] text-center leading-[100%]"
          style={{ opacity: desc2Opacity }}
        >
          Pure video. No cuts, no slow motion, no speed ramping, no on-screen text, no cutting away
          to another angle.
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

export { Works };