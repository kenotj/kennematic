'use client';

/* KENNEMATIC — Featured projects (sec2).
 *
 * Port of legacy `.sec2` + `updateSec2()` choreography. Two implementation
 * rules survive from that port:
 *
 *   1. Blocks are registered with `metrics.registerBlocks()` and read from the
 *      CACHED `metrics.blocks` snapshot (refreshed once per resize) — never
 *      offsetTop/offsetHeight during a frame.
 *   2. Nothing animated goes through React state. Every per-frame value is a
 *      MotionValue bound straight to `style`, so this component renders once.
 *
 * The strip reads as two screens:
 *
 *   1. title + view-all button + the four project cards — everything about the
 *      featured work, together, riding up as the strip lifts.
 *   2. the services block, which is what the strip PINS on (PIN_FRAC of the
 *      viewport, see plate.jsx measure()).
 *
 * Both groups stay short on purpose: the reading band dims any block taller
 * than roughly vh − BAND_HL − BAND_TOP − BAND_BOT, so a block that grows a
 * couple of rows would never reach full opacity on short viewports.
 *
 * The list is a single filmstrip row of four glass cards.
 *
 * Cards are links to /projects/[slug]. The root keeps pointer-events-none;
 * only the anchors opt back in, and a fully flown card drops out of
 * hit-testing via `.is-flown` (globals.css) because ±62vw does not clear the
 * viewport. Fly direction: left pair flies left, right pair flies right,
 * staggered within each pair.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import TransitionLink from './site/TransitionLink.jsx';
import { LiquidFill, liquidInk, LIQUID_INK_TRANSITION } from './site/liquidHover.jsx';
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
  SERVICES,
} from '../lib/constants.js';
import { PROJECTS } from '../lib/projects.js';

/* Blur is the most expensive thing on this page: it repaints text. Quantizing
   to a coarse step means most frames write a value byte-identical to the last
   one, and the browser skips the repaint entirely. */
const BLUR_STEP = 0.25;
const TITLE_BLUR = 6; /* legacy: (1 - o)^2 * 6px */
const ROW_BLUR = 12; /* legacy: --fly-blur, fly^2 * 12px */
const FLY_X = 0.62; /* legacy: --fly-x, 62vw */

const blurCss = (px) => (px > 0 ? `blur(${px}px)` : 'none');

/* Tiny deterministic hash → a per-card gradient so the four placeholder
   thumbs don't look identical. Swap the thumb div for a real still later. */
function thumbGradient(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 997;
  const angle = 110 + (h % 7) * 20;
  const a = 10 + (h % 5) * 2;
  const b = 22 + (h % 4) * 3;
  return `linear-gradient(${angle}deg, hsl(0 0% ${a}%), hsl(0 0% ${b}%))`;
}

/* -------------------------------------------------------------------- card */

function Card({ item, index, progress, metrics, version, reduced }) {
  const ref = useRef(null);
  /* left pair flies left, right pair right; stagger index is WITHIN the pair */
  const dir = index < 2 ? -1 : 1;
  const k = index % 2;

  /* raw fly amount 0..1 — shared shape for x / opacity / blur */
  const fly = useTransform(progress, (p) => {
    if (reduced) return 0;
    const u = norm(p, FLY[0], FLY[1]);
    return r3(easeIn(clamp01((u - k * FLY_STEP) / FLY_DUR)));
  });

  /* translateX(dir * fly * 62vw), resolved against the measured viewport so a
     resize re-solves it without a re-render (version is the resize tick). */
  const x = useTransform([fly, version], ([f]) => dir * f * FLY_X * metrics.vw);
  const opacity = useTransform(fly, (f) => r3(1 - f * f));
  const filter = useTransform(fly, (f) =>
    !reduced && f > 0 && f < 1 ? blurCss(quantize(f * f * ROW_BLUR, BLUR_STEP)) : 'none'
  );

  /* `.is-flying` is preserved for the reduced-motion stylesheet rule, and
     `.is-flown` drops a fully flown (invisible) card out of hit-testing; the
     classes flip at most twice per pass, so an imperative toggle costs nothing. */
  useEffect(() => {
    const apply = (f) => {
      const node = ref.current;
      if (!node) return;
      node.classList.toggle('is-flying', f > 0 && f < 1);
      node.classList.toggle('is-flown', f >= 1);
    };
    apply(fly.get());
    return fly.on('change', apply);
  }, [fly]);

  const hover = reduced ? undefined : 'hover';

  return (
    <motion.div ref={ref} className="w-row min-w-0 flex-1" style={{ x, opacity, filter }}>
      <TransitionLink
        href={`/projects/${item.slug}`}
        className={[
          'block rounded-[14px]',
          'pointer-events-auto',
          'focus-visible:[outline:2px_solid_var(--red)]',
          'focus-visible:[outline-offset:4px]',
        ].join(' ')}
      >
        {/* Hover lives on an INNER motion element so its transform can't fight
            the fly x/blur bound on the outer wrapper. `whileHover` here drives
            every nested variant below, so the flood, the thumb push-in, the
            title shift and the arrow all share one gesture.

            The whole card floods, so the fill sits at inset-0 and each child
            stacks above it with `relative`. Ink is set here and inherited, so
            the eyebrow and title invert together (their opacity utilities
            still apply, which is what keeps the eyebrow secondary on white). */}
        <motion.div
          className="glass relative overflow-hidden rounded-[14px] p-[0.55vw]"
          initial="rest"
          whileHover={hover}
          whileTap={reduced ? undefined : 'tap'}
          animate="rest"
          variants={{
            rest: { y: 0, scale: 1, color: 'rgb(255,255,255)' },
            hover: { y: -8, scale: 1.025, color: 'rgb(0,0,0)' },
            /* the press reads as the card being pushed into the transition
               that TransitionLink is about to start */
            tap: { y: -2, scale: 0.985, color: 'rgb(0,0,0)' },
          }}
          transition={{
            type: 'spring',
            stiffness: 320,
            damping: 26,
            color: LIQUID_INK_TRANSITION,
          }}
        >
          <LiquidFill />
          <div className="relative aspect-video w-full overflow-hidden rounded-[9px]">
            <motion.div
              className="absolute inset-0"
              style={{ background: thumbGradient(item.slug) }}
              variants={{ rest: { scale: 1 }, hover: { scale: 1.08 }, tap: { scale: 1.08 } }}
              transition={{ type: 'spring', stiffness: 220, damping: 30 }}
            />
          </div>
          <div className="relative px-[0.35vw] pb-[0.25vw] pt-[0.65vw]">
            <p className="m-0 text-[length:var(--fs-micro)] uppercase tracking-[0.1em] opacity-70 whitespace-nowrap overflow-hidden text-ellipsis">
              {item.category} · {item.year}
            </p>
            {/* clamp + min-height keep the four cards the same height whether
                a title runs one line or two */}
            <motion.p
              className="m-0 mt-[0.25vw] flex min-h-[2.3em] items-start gap-[0.4vw] text-[length:var(--fs-ui)] font-semibold leading-[115%]"
              variants={{ rest: { x: 0 }, hover: { x: 4 }, tap: { x: 4 } }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
              <span className="line-clamp-2">{item.title}</span>
              <motion.span
                aria-hidden="true"
                className="shrink-0"
                variants={{
                  rest: { opacity: 0, x: -6 },
                  hover: { opacity: 1, x: 0 },
                  tap: { opacity: 1, x: 0 },
                }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              >
                →
              </motion.span>
            </motion.p>
          </div>
        </motion.div>
      </TransitionLink>
    </motion.div>
  );
}

/* ------------------------------------------------------------ kinetic word */

/* One word of the section heading, riding its own slice of the title's enter
   progress (`enter` = titleRaw) — scrubbed by scroll like everything else, so
   it plays perfectly in reverse. Reduced motion: plain span, the block-level
   fade covers it. */
function KineticWord({ text, enter, index, accent, reduced }) {
  /* 0.18 step / 0.5 span spreads the four words across the whole enter range
     (word 3 finishes exactly at 1) — the upstream expoOut front-loads the
     progress, so wider windows are what keep the cascade readable. */
  const w = useTransform(enter, (o) => r3(clamp01(norm(o, index * 0.18, index * 0.18 + 0.5))));
  const y = useTransform(w, (v) => `${r3((1 - v) * 0.55)}em`);

  const cls = accent ? 'w-script type-accent leading-[0]' : '';
  if (reduced) return <span className={cls}>{text}</span>;
  return (
    <motion.span className={`inline-block ${cls}`} style={{ y, opacity: w }}>
      {text}
    </motion.span>
  );
}

/* ------------------------------------------------------------------- works */

export default function Works() {
  const { progress, metrics, reduced } = usePlate();

  const rootRef = useRef(null);
  const titleRef = useRef(null);
  const ctaRef = useRef(null);
  const listRef = useRef(null);
  const servicesRef = useRef(null);

  /* Resize tick. metrics is mutated in place, so MotionValues that depend on
     geometry need something to re-fire on; bumping this drives them all. */
  const version = useMotionValue(0);

  useLayoutEffect(() => {
    /* subscribe BEFORE registering — registerBlocks() measures synchronously,
       and we want that first measurement to reach our transforms. */
    const unsubscribe = metrics.subscribe(() => version.set(version.get() + 1));
    const unregister = metrics.registerBlocks({
      title: titleRef,
      cta: ctaRef,
      list: listRef,
      services: servicesRef,
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

  const ctaOpacity = useTransform([s2y, version], ([y]) => r3(band('cta', y)));
  const listOpacity = useTransform([s2y, version], ([y]) => r3(band('list', y)));
  const servicesOpacity = useTransform([s2y, version], ([y]) => r3(band('services', y)));

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
      className="sec2 is-hidden fixed inset-0 z-[6] overflow-hidden pointer-events-none font-medium font-body"
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
            Featured projects
          </p>
          {/* each word rides its own slice of the enter progress — kinetic,
              but still fully scroll-scrubbed and reversible */}
          <h2 className="w-mark font-display font-extrabold text-[length:var(--fs-work)] leading-[100%]">
            <KineticWord text="Made" enter={titleRaw} index={0} reduced={reduced} />{' '}
            <KineticWord text="to" enter={titleRaw} index={1} reduced={reduced} />{' '}
            <KineticWord text="move" enter={titleRaw} index={2} reduced={reduced} />{' '}
            <KineticWord text="(really)" enter={titleRaw} index={3} accent reduced={reduced} />
          </h2>
        </motion.div>

        {/* The view-all button. It shares the card row's width and box so
            `justify-end` lands its right edge exactly on the right edge of the
            last card, rather than on the page gutter. */}
        <motion.div
          ref={ctaRef}
          data-block=""
          className="w-cta absolute left-[50%] top-[25vw] flex w-[64.2857vw] -translate-x-1/2 justify-end"
          style={{ opacity: ctaOpacity }}
        >
          <TransitionLink
            href="/projects"
            className="pointer-events-auto rounded-full focus-visible:[outline:2px_solid_var(--red)] focus-visible:[outline-offset:4px]"
          >
            <motion.span
              className="glass relative flex items-center gap-[0.5vw] overflow-hidden rounded-full px-[1.1vw] py-[0.6vw] text-[length:var(--fs-micro)] font-semibold uppercase tracking-[0.08em] leading-[100%]"
              initial="rest"
              animate="rest"
              whileHover={reduced ? undefined : 'hover'}
              whileTap={reduced ? undefined : 'tap'}
              variants={{
                rest: { y: 0, scale: 1 },
                hover: { y: -4, scale: 1.04 },
                tap: { y: 0, scale: 0.97 },
              }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
              <LiquidFill scale="sm" />
              <motion.span
                className="relative"
                variants={liquidInk}
                transition={LIQUID_INK_TRANSITION}
              >
                View all projects
              </motion.span>
              <motion.span
                aria-hidden="true"
                className="relative"
                variants={{
                  rest: { x: 0, color: 'rgb(255,255,255)' },
                  hover: { x: 6, color: 'rgb(0,0,0)' },
                  tap: { x: 6, color: 'rgb(0,0,0)' },
                }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              >
                →
              </motion.span>
            </motion.span>
          </TransitionLink>
        </motion.div>

        <motion.div
          ref={listRef}
          data-block=""
          className="w-list absolute top-[31vw] left-[50%] w-[64.2857vw] -translate-x-1/2 flex flex-row items-stretch gap-[1.8vw]"
          style={{ opacity: listOpacity }}
        >
          {PROJECTS.map((item, i) => (
            <Card
              key={item.slug}
              item={item}
              index={i}
              progress={progress}
              metrics={metrics}
              version={version}
              reduced={reduced}
            />
          ))}
        </motion.div>

        {/* The pinned block. Two columns on purpose — four stacked rows would
            push it past the reading band's height ceiling on a 16:9 viewport
            and it would never reach full opacity. */}
        <motion.div
          ref={servicesRef}
          data-block=""
          className="w-services absolute top-[96vw] left-[50%] w-[64.2857vw] -translate-x-1/2"
          style={{ opacity: servicesOpacity }}
        >
          <p className="m-0 text-[length:var(--fs-micro)] uppercase tracking-[0.1em] leading-[100%] opacity-70">
            What I provide
          </p>
          <ul className="m-0 mt-[1.8vw] grid list-none grid-cols-2 gap-x-[1.8vw] gap-y-[1.6vw] p-0">
            {SERVICES.map((s, i) => (
              <li key={s.name} className="border-t border-white/15 pt-[0.9vw]">
                <p className="m-0 flex items-baseline gap-[0.7vw] text-[length:var(--fs-ui)] font-semibold leading-[115%]">
                  <span className="text-[length:var(--fs-micro)] font-medium tabular-nums opacity-50">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {s.name}
                </p>
                <p className="m-0 mt-[0.45vw] text-[length:var(--fs-micro)] leading-[145%] opacity-70">
                  {s.blurb}
                </p>
              </li>
            ))}
          </ul>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export { Works };