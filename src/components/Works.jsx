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
 *   1. the featured group — centred heading, the four project cards, then the
 *      view-all button under them — everything about the featured work, in one
 *      flow column. It rises in, HOLDS still for a beat (HOLD_FRAC, see
 *      plate.jsx measure()), then lifts away.
 *   2. the services block, which is what the strip PINS on (PIN_FRAC of the
 *      viewport, see plate.jsx measure()).
 *
 * The list is a compact responsive grid of glass cards. It becomes a vertical
 * stack of horizontal cards on phones, then returns to multiple columns and
 * the original single row as more width becomes available.
 *
 * Cards are links to /projects/[slug]. The root keeps pointer-events-none;
 * only the anchors opt back in, and a fully flown card drops out of
 * hit-testing via `.is-flown` (globals.css) because ±62vw does not clear the
 * viewport. Fly direction: the left pair flies left, the right pair right,
 * the outer cards leading the inner.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import TransitionLink from './site/TransitionLink.jsx';
import { LiquidFill, liquidInk, LIQUID_INK_TRANSITION } from './site/liquidHover.jsx';
import { usePlate } from '../lib/plate.jsx';
import { clamp01, expoOut, easeIn, norm, r3, quantize, smoothstep } from '../lib/easing.js';
import {
  SEC2_SHOW,
  SEC2_RAMP,
  SEC2_LIFT,
  SEC2_ENTER,
  FLY,
  FLY_STEP,
  FLY_DUR,
  BAND_HL,
  BAND_TOP,
  BAND_BOT,
  SERVICES,
} from '../lib/constants.js';
import { useProjects } from '../lib/projectsContext.jsx';

/* Blur is the most expensive thing on this page: it repaints text. Quantizing
   to a coarse step means most frames write a value byte-identical to the last
   one, and the browser skips the repaint entirely. */
const BLUR_STEP = 0.25;
const TITLE_BLUR = 6; /* legacy: (1 - o)^2 * 6px */
const ROW_BLUR = 12; /* legacy: --fly-blur, fly^2 * 12px */
const FLY_X = 0.62; /* legacy: --fly-x, 62vw */

/* Every value is a complete static Tailwind string so the scanner can emit the
   right responsive grid without a runtime style declaration overriding it. */
const FEATURED_GRID = {
  0: 'grid-cols-1',
  1: 'grid-cols-1 max-w-[22rem]',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-6',
};

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

function Card({ item, index, count, progress, metrics, version, reduced }) {
  const ref = useRef(null);
  /* Single row: the left half flies left and the right half right, so the
     split follows the centre seam; the stagger index counts inward from the
     edge, so the outer cards leave ahead of the inner ones. (≤3 per half —
     the choreography ceiling; getFeaturedProjects caps the list at 6.) */
  const dir = index < count / 2 ? -1 : 1;
  const k = dir < 0 ? index : count - 1 - index;

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

  /* A fully flown (invisible) card drops out of hit-testing. */
  useEffect(() => {
    const apply = (f) => {
      const node = ref.current;
      if (!node) return;
      node.classList.toggle('is-flown', f >= 1);
    };
    apply(fly.get());
    return fly.on('change', apply);
  }, [fly]);

  const hover = reduced ? undefined : 'hover';

  return (
    <motion.div
      ref={ref}
      className="w-row min-w-0 [&.is-flown]:pointer-events-none motion-reduce:!transform-none motion-reduce:!filter-none"
      style={{ x, opacity, filter }}
    >
      <TransitionLink
        href={`/projects/${item.slug}`}
        className={[
          'block h-full rounded-[10px]',
          'pointer-events-auto',
          'focus-visible:outline-2 focus-visible:outline-red focus-visible:outline-offset-4',
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
          className="glass relative flex h-full overflow-hidden rounded-[10px] p-1 sm:block sm:p-[0.45vw]"
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
          <div className="relative aspect-[4/3] w-[38%] shrink-0 overflow-hidden rounded-[7px] [@media(max-height:600px)]:aspect-[3/2] sm:aspect-video sm:w-full sm:[@media(max-height:600px)]:aspect-[2/1]">
            <motion.div
              className="absolute inset-0"
              style={item.thumb?.url ? undefined : { background: thumbGradient(item.slug) }}
              variants={{ rest: { scale: 1 }, hover: { scale: 1.08 }, tap: { scale: 1.08 } }}
              transition={{ type: 'spring', stiffness: 220, damping: 30 }}
            >
              {item.thumb?.url &&
                (item.thumb.kind === 'video' ? (
                  <video
                    className="h-full w-full object-cover"
                    src={item.thumb.url}
                    poster={item.thumb.poster || undefined}
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  <img className="h-full w-full object-cover" src={item.thumb.url} alt="" />
                ))}
            </motion.div>
          </div>
          <div className="relative flex min-w-0 flex-1 flex-col justify-center px-3 py-2 sm:block sm:px-[0.3vw] sm:pb-[0.25vw] sm:pt-[0.55vw]">
            <p className="m-0 overflow-hidden text-micro text-ellipsis whitespace-nowrap uppercase opacity-70 tracking-[0.1em]">
              {item.category} · {item.year}
            </p>
            {/* line-clamp still caps a long title at two lines; the min-height
                floor is only there so a one-line title doesn't sit tight
                against the card edge — the grid equalises the row itself.
                That equalising only reaches the visible card because the grid
                item, the anchor and the glass box all carry h-full: without
                that chain the cell stretches and the card inside it still
                shrink-wraps its copy, which is what left a one-line title
                (Coehl) sitting shorter than a two-line one (Born from
                Nature). */}
            <motion.p
              className="m-0 mt-1 flex min-h-[1.25em] items-start gap-1 text-ui leading-[115%] font-semibold sm:mt-[0.25vw] sm:gap-[0.4vw]"
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
            {/* one-line pitch under the title — same voice as the services
                blurbs (micro size, 145% leading, secondary), clamped so a
                long summary can't unbalance the row */}
            <p className="card-summary m-0 mt-1.5 hidden text-micro leading-[145%] opacity-70 sm:line-clamp-2 sm:mt-[0.45vw] [@media(max-height:600px)]:!hidden">
              {item.summary}
            </p>
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

  const cls = accent ? 'w-script font-display font-light italic leading-[0]' : '';
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
  const { featured } = useProjects();

  const titleRef = useRef(null);
  const ctaRef = useRef(null);
  const listRef = useRef(null);
  const servicesRef = useRef(null);
  const gridClass = FEATURED_GRID[Math.min(featured.length, 6)] || FEATURED_GRID[6];

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

  /* Two moves, one hold. The second term only leaves 0 once the first has
     saturated (SEC2_RAMP[1] <= SEC2_LIFT[0]), so between them the strip is
     genuinely stationary and the featured group holds for the reader. */
  const s2y = useTransform([progress, version], ([p]) => {
    if (reduced) return metrics.s2Pin;
    const rise = smoothstep(norm(p, SEC2_RAMP[0], SEC2_RAMP[1]));
    const lift = smoothstep(norm(p, SEC2_LIFT[0], SEC2_LIFT[1]));
    return r3(
      metrics.s2Start +
        (metrics.s2Hold - metrics.s2Start) * rise +
        (metrics.s2Pin - metrics.s2Hold) * lift
    );
  });

  /* ---------------------------------------------------- visibility gate */

  const visibility = useTransform(progress, (p) =>
    p >= SEC2_SHOW[0] && p <= SEC2_SHOW[1] ? 'visible' : 'hidden'
  );

  /* ------------------------------------------------- per-block opacity */

  /* The legacy "reading band": a block is lit only while it sits inside a
     window of the viewport. top/bottom are its position IN THE VIEWPORT, i.e.
     cached offset + current strip translation — no layout read. */
  const band = useMemo(() => {
    return (key, s2yPx) => {
      const b = metrics.blocks[key];
      const top = b.top + s2yPx;
      const bottom = top + b.height;
      /* The band was tuned for half-screen blocks: full opacity wants
         BAND_HL + BAND_TOP of headroom and BAND_BOT of footroom, so a block
         taller than vh minus that sum could never light — which the featured
         group was, back when it ran 2x2. When a block doesn't fit, each side's
         ramp is scaled to the slack that side actually gets (half of what's
         left over), which makes a centred tall block peak at exactly 1 rather
         than sitting permanently dimmed. A block that fits keeps the original
         numbers untouched, so the services pin is unaffected. */
      const slack = Math.max(0, metrics.vh - b.height);
      const fits = slack >= BAND_HL + BAND_TOP + BAND_BOT;
      const half = slack / 2;
      const squeeze = fits ? 1 : Math.min(1, half / (BAND_HL + BAND_TOP));
      const hl = BAND_HL * squeeze;
      /* both ramps floor at 1px: a block exactly as tall as the viewport has no
         slack at all, and a zero-length ramp would divide to NaN */
      const upRamp = Math.max(1, BAND_TOP * squeeze);
      const downRamp = Math.max(1, fits ? BAND_BOT : Math.min(BAND_BOT, half));
      return clamp01(
        Math.min(
          expoOut(clamp01((top - hl) / upRamp)),
          expoOut(clamp01((metrics.vh - bottom) / downRamp))
        )
      );
    };
  }, [metrics]);

  /* Heading, cards and button all read the GROUP's band, not their own: they
     are one composed screen now, and banding them separately would fade the
     button out while the heading above it was still bright. */
  const groupOpacity = useTransform([s2y, version], ([y]) => r3(band('group', y)));
  const servicesOpacity = useTransform([s2y, version], ([y]) => r3(band('services', y)));

  /* Title carries the extra SEC2_ENTER fade on top of the band. */
  const titleRaw = useTransform([s2y, progress, version], ([y, p]) =>
    clamp01(band('group', y) * expoOut(norm(p, SEC2_ENTER[0], SEC2_ENTER[1])))
  );
  const titleOpacity = useTransform(titleRaw, r3);
  const titleFilter = useTransform(titleRaw, (o) =>
    !reduced && o > 0 && o < 1
      ? blurCss(quantize((1 - o) * (1 - o) * TITLE_BLUR, BLUR_STEP))
      : 'none'
  );

  /* ------------------------------------------------------------- render */

  return (
    <motion.div
      id="sec2"
      className="sec2 fixed inset-0 z-[6] overflow-hidden pointer-events-none font-body font-medium"
      style={{ visibility }}
    >
      <motion.div
        id="strip"
        className="strip absolute top-0 left-0 w-[100vw] will-change-transform"
        style={{ y: s2y }}
      >
        {/* The featured group — heading, responsive card grid, view-all — as ONE
            centred flow column, in reading order. The wrapper is deliberately
            unpositioned: measure() reads each block's offsetTop expecting
            `.strip` to be the offsetParent, so a `relative`/`absolute` wrapper
            here would silently re-base every block top and break the reading
            band. The padding-top (not a `top`) is what holds the heading at its
            old 22.9252vw, which is where s2Start is anchored.

            Width is mobile-first and returns to the original 64.2857vw
            reading measure on wide screens. The responsive column count keeps
            the group short enough for the viewport at each breakpoint. */}
        <div className="w-group mx-auto flex w-[calc(100vw-2rem)] flex-col items-center pt-[32svh] sm:w-[82vw] sm:pt-[28vw] lg:w-[64.2857vw] lg:pt-[22.9252vw]">
          <motion.div
            ref={titleRef}
            data-block=""
            className="w-title flex w-full flex-col items-center gap-2 text-center motion-reduce:!filter-none sm:gap-[1.1vw]"
            style={{ opacity: titleOpacity, filter: titleFilter }}
          >
            <p className="w-eyebrow text-micro leading-[100%] uppercase">
              Featured projects
            </p>
            {/* each word rides its own slice of the enter progress — kinetic,
                but still fully scroll-scrubbed and reversible */}
            <h2 className="w-mark font-display text-work leading-[100%] font-extrabold">
              <KineticWord text="Made" enter={titleRaw} index={0} reduced={reduced} />{' '}
              <KineticWord text="to" enter={titleRaw} index={1} reduced={reduced} />{' '}
              <KineticWord text="move" enter={titleRaw} index={2} reduced={reduced} />{' '}
              <KineticWord text="(really)" enter={titleRaw} index={3} accent reduced={reduced} />
            </h2>
          </motion.div>

          <motion.div
            ref={listRef}
            data-block=""
            className={`w-list mt-4 grid w-full max-w-[32rem] justify-center gap-3 sm:mt-[2vw] sm:max-w-none sm:gap-x-[1.8vw] ${gridClass}`}
            style={{ opacity: groupOpacity }}
          >
            {featured.map((item, i) => (
              <Card
                key={item.slug}
                item={item}
                index={i}
                count={featured.length}
                progress={progress}
                metrics={metrics}
                version={version}
                reduced={reduced}
              />
            ))}
          </motion.div>

          {/* The view-all button, centred under the card row — the last beat of
              the group, read after the work it opens out to. */}
          <motion.div
            ref={ctaRef}
            data-block=""
            className="w-cta mt-4 flex w-full justify-center sm:mt-[1.6vw]"
            style={{ opacity: groupOpacity }}
          >
            <TransitionLink
              href="/projects"
              className="pointer-events-auto rounded-full focus-visible:outline-2 focus-visible:outline-red focus-visible:outline-offset-4"
            >
              <motion.span
                className="glass relative flex min-h-11 items-center gap-2 overflow-hidden rounded-full px-4 py-3 text-micro leading-[100%] font-semibold tracking-[0.08em] uppercase sm:gap-[0.5vw] sm:px-[1.1vw] sm:py-[0.6vw]"
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
        </div>

        {/* The pinned block stacks on phones and returns to two columns once
            there is enough width to keep it inside the reading band. */}
        <motion.div
          ref={servicesRef}
          data-block=""
          className="w-services absolute top-[max(760px,135svh)] left-1/2 w-[calc(100vw-2rem)] -translate-x-1/2 sm:w-[82vw] lg:top-[96vw] lg:w-[64.2857vw]"
          style={{ opacity: servicesOpacity }}
        >
          <p className="m-0 text-micro leading-[100%] tracking-[0.1em] uppercase opacity-70">
            What I provide
          </p>
          <ul className="m-0 mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:mt-[1.8vw] sm:grid-cols-2 sm:gap-x-[1.8vw] sm:gap-y-[1.6vw]">
            {SERVICES.map((s, i) => (
              <li key={s.name} className="border-t border-white/15 pt-3 sm:pt-[0.9vw]">
                <p className="m-0 flex items-baseline gap-2 text-ui leading-[115%] font-semibold sm:gap-[0.7vw]">
                  <span className="text-micro font-medium tabular-nums opacity-50">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {s.name}
                </p>
                <p className="m-0 mt-1.5 text-micro leading-[145%] opacity-70 sm:mt-[0.45vw]">
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
