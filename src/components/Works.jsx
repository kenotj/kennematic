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
 * The list is a 2x2 grid of glass cards with 16:9 thumbs, which makes the
 * featured group about a screen tall. Two consequences, both handled below:
 * the group is sized against the viewport HEIGHT as well as its width (see the
 * wrapper), and it reads the reading band as one box rather than per block.
 *
 * Cards are links to /projects/[slug]. The root keeps pointer-events-none;
 * only the anchors opt back in, and a fully flown card drops out of
 * hit-testing via `.is-flown` (globals.css) because ±62vw does not clear the
 * viewport. Fly direction: the left column flies left, the right column right,
 * the top row leading the bottom.
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
  /* 2x2 grid: the left COLUMN flies left and the right column flies right, so
     the split follows the seam the reader sees; the stagger index is the ROW,
     so the top pair leaves ahead of the bottom pair. */
  const dir = index % 2 === 0 ? -1 : 1;
  const k = index < 2 ? 0 : 1;

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
    <motion.div ref={ref} className="w-row min-w-0" style={{ x, opacity, filter }}>
      <TransitionLink
        href={`/projects/${item.slug}`}
        className={[
          'block rounded-[10px]',
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
          className="glass relative overflow-hidden rounded-[10px] p-[0.33vw]"
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
          <div className="relative aspect-video w-full overflow-hidden rounded-[7px]">
            <motion.div
              className="absolute inset-0"
              style={{ background: thumbGradient(item.slug) }}
              variants={{ rest: { scale: 1 }, hover: { scale: 1.08 }, tap: { scale: 1.08 } }}
              transition={{ type: 'spring', stiffness: 220, damping: 30 }}
            />
          </div>
          <div className="relative px-[0.21vw] pb-[0.15vw] pt-[0.39vw]">
            <p className="m-0 text-[length:var(--fs-micro)] uppercase tracking-[0.1em] opacity-70 whitespace-nowrap overflow-hidden text-ellipsis">
              {item.category} · {item.year}
            </p>
            {/* line-clamp still caps a long title at two lines; the min-height
                floor is only there so a one-line title doesn't sit tight
                against the card edge — the grid equalises the row itself. */}
            <motion.p
              className="m-0 mt-[0.15vw] flex min-h-[1.25em] items-start gap-[0.24vw] text-[length:var(--fs-ui)] font-semibold leading-[115%]"
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
      /* The band was tuned for half-screen blocks: full opacity wants
         BAND_HL + BAND_TOP of headroom and BAND_BOT of footroom, so a block
         taller than vh minus that sum could never light — and the featured
         group IS taller than it now. When a block doesn't fit, each side's
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
        {/* The featured group — heading, the 2x2 card grid, view-all — as ONE
            centred flow column, in reading order. The wrapper is deliberately
            unpositioned: measure() reads each block's offsetTop expecting
            `.strip` to be the offsetParent, so a `relative`/`absolute` wrapper
            here would silently re-base every block top and break the reading
            band. The padding-top (not a `top`) is what holds the heading at its
            old 22.9252vw, which is where s2Start is anchored.

            Width: the whole group runs at 60% of its original size on desktop
            (it read too big), so the grid caps at 27.6vw and the local
            font-var overrides below shrink only the vw term of each size —
            the px floors stay, so small screens are untouched. Summing the
            column at a grid width G gives a group height of 13.5vw + 0.5625G;
            holding that to 88% of the viewport height solves to
            G <= 1.564*vh - 23.9vw, which is the second term. It only binds on
            very short viewports — at 16:9 and taller the 27.6vw cap wins. The
            15.6vw floor is a backstop: on an extreme aspect the group
            overflows rather than collapsing to nothing. */}
        <div className="w-group mx-auto flex w-[min(27.6vw,max(15.6vw,calc(156.4vh_-_23.9vw)))] flex-col items-center pt-[22.9252vw] [--fs-work:max(24px,2.0408vw)] [--fs-ui:max(13px,1.2245vw)] [--fs-micro:max(11px,0.6122vw)]">
          <motion.div
            ref={titleRef}
            data-block=""
            className="w-title flex w-full flex-col items-center gap-[0.66vw] text-center"
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

          <motion.div
            ref={listRef}
            data-block=""
            className="w-list mt-[1.2vw] grid w-full grid-cols-2 gap-[0.96vw]"
            style={{ opacity: groupOpacity }}
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

          {/* The view-all button, centred under the card row — the last beat of
              the group, read after the work it opens out to. */}
          <motion.div
            ref={ctaRef}
            data-block=""
            className="w-cta mt-[0.96vw] flex w-full justify-center"
            style={{ opacity: groupOpacity }}
          >
            <TransitionLink
              href="/projects"
              className="pointer-events-auto rounded-full focus-visible:[outline:2px_solid_var(--red)] focus-visible:[outline-offset:4px]"
            >
              <motion.span
                className="glass relative flex items-center gap-[0.3vw] overflow-hidden rounded-full px-[0.66vw] py-[0.36vw] text-[length:var(--fs-micro)] font-semibold uppercase tracking-[0.08em] leading-[100%]"
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