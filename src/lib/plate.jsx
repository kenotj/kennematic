'use client';

/* PLATE® — scroll engine core.
 *
 * Owns the single source of truth every animated component reads:
 *   progress  — MotionValue<number> 0..1, scrollY / runwayPx (never re-renders React)
 *   metrics   — ref-stable mutable geometry object, refreshed by measure()
 *   reduced   — live prefers-reduced-motion boolean
 *
 * Layout is read ONCE per measure() and cached. The legacy loop read
 * offsetTop/offsetHeight of every works block on every animation frame, which
 * forced a synchronous layout each frame; that does not survive this port.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useScroll, useMotionValue } from 'framer-motion';

import { clamp01 } from './easing.js';
import {
  WIPE_VH,
  PIN_FRAC,
  S2_EMERGE,
  A,
  B,
  titleOut,
  titleIn,
} from './constants.js';

/* ---------------------------------------------------------------- entrance */

let shown = false;
function showPage() {
  if (shown) return;
  shown = true;
  requestAnimationFrame(() => document.documentElement.classList.add('is-ready'));
}

/* ----------------------------------------------------------------- context */

const PlateContext = createContext(null);

export function usePlate() {
  const ctx = useContext(PlateContext);
  if (!ctx) throw new Error('usePlate() must be used inside <PlateProvider>');
  return ctx;
}

/* helper: accept either a React ref object or a raw element */
const el = (x) => (x && typeof x === 'object' && 'current' in x ? x.current : x) || null;

function emptyBlock() {
  return { top: 0, height: 0 };
}

export function PlateProvider({ children }) {
  const { scrollY } = useScroll();
  const progress = useMotionValue(0);

  /* Keep the server and first client render identical. The mount effect below
   * applies the real preference and continues tracking live changes. */
  const [reduced, setReduced] = useState(false);
  const [motionReady, setMotionReady] = useState(false);

  /* ------------------------------------------------------------- metrics */
  /* Created once. Mutated in place — never replaced, never React state. */
  const metricsRef = useRef(null);
  if (metricsRef.current === null) {
    metricsRef.current = {
      vw: typeof window === 'undefined' ? 0 : window.innerWidth,
      vh: typeof window === 'undefined' ? 0 : window.innerHeight,
      runwayPx: 1,
      wipe: 0.1,
      s2Start: 0,
      s2Pin: 0,
      blocks: {
        title: emptyBlock(),
        desc1: emptyBlock(),
        list: emptyBlock(),
        desc2: emptyBlock(),
      },
      /* filled in below */
      registerBlocks: null,
      subscribe: null,
      measure: null,
    };
  }
  const metrics = metricsRef.current;

  /* registered element refs for the works strip */
  const blockRefs = useRef({ title: null, desc1: null, list: null, desc2: null });
  const subs = useRef(new Set());

  /* -------------------------------------------------------------- measure */
  const measureRef = useRef(null);
  if (measureRef.current === null) {
    measureRef.current = function measure() {
      if (typeof window === 'undefined') return;

      const vh = window.innerHeight;
      metrics.vw = window.innerWidth;
      metrics.vh = vh;
      metrics.runwayPx = Math.max(
        1,
        document.documentElement.scrollHeight - vh
      );

      // a wipe should take WIPE_VH of scrolling, expressed as a fraction of p —
      // capped so a short runway can never hand a single wipe a third of the page.
      metrics.wipe = Math.min(0.28, ((WIPE_VH / 100) * vh) / metrics.runwayPx);

      /* --- works blocks: the ONLY place offsetTop/offsetHeight is read --- */
      const b = metrics.blocks;
      let any = false;
      for (const key of ['title', 'desc1', 'list', 'desc2']) {
        const node = el(blockRefs.current[key]);
        if (node) {
          b[key].top = node.offsetTop;
          b[key].height = node.offsetHeight;
          any = true;
        } else {
          b[key].top = 0;
          b[key].height = 0;
        }
      }

      if (any) {
        const titleTop = b.title.top;
        const groupTop = Math.min(b.list.top, b.desc2.top);
        const groupBottom = Math.max(
          b.list.top + b.list.height,
          b.desc2.top + b.desc2.height
        );
        const groupCenter = (groupTop + groupBottom) / 2;

        metrics.s2Pin = PIN_FRAC * vh - groupCenter;
        metrics.s2Start = S2_EMERGE * vh - titleTop;
      }

      /* keep progress honest after a runway change */
      progress.set(clamp01(window.scrollY / metrics.runwayPx));

      for (const fn of subs.current) {
        try {
          fn(metrics);
        } catch (e) {
          /* a bad subscriber must not break the rest */
        }
      }
    };
  }
  const measure = measureRef.current;

  /* wire the mutable API onto metrics once */
  if (!metrics.subscribe) {
    metrics.measure = () => measureRef.current();
    metrics.subscribe = (fn) => {
      subs.current.add(fn);
      return () => subs.current.delete(fn);
    };
    metrics.registerBlocks = (refs) => {
      if (!refs) return;
      for (const key of ['title', 'desc1', 'list', 'desc2']) {
        if (key in refs) blockRefs.current[key] = refs[key];
      }
      measureRef.current();
      return () => {
        for (const key of ['title', 'desc1', 'list', 'desc2']) {
          if (key in refs && blockRefs.current[key] === refs[key]) {
            blockRefs.current[key] = null;
          }
        }
      };
    };
  }

  /* ------------------------------------------------ progress from scrollY */
  useEffect(() => {
    const write = (y) => {
      // Mobile URL-bar collapse changes innerHeight many times per gesture.
      // Width changes are immediate; the debounced resize handler owns height.
      if (window.innerWidth !== metrics.vw) {
        measureRef.current();
        return;
      }
      progress.set(clamp01(y / metrics.runwayPx));
    };
    write(scrollY.get());
    return scrollY.on('change', write);
  }, [scrollY, progress, metrics]);

  /* ----------------------------------------------- measure lifecycle */
  useEffect(() => {
    measureRef.current();

    let rt = 0;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(() => measureRef.current(), 120);
    };
    const onLoad = () => measureRef.current();

    addEventListener('resize', onResize);
    addEventListener('orientationchange', onResize);
    addEventListener('load', onLoad);

    return () => {
      clearTimeout(rt);
      removeEventListener('resize', onResize);
      removeEventListener('orientationchange', onResize);
      removeEventListener('load', onLoad);
    };
  }, []);

  /* ------------------------------------------------- reduced motion, live */
  useEffect(() => {
    if (typeof matchMedia !== 'function') {
      setMotionReady(true);
      return;
    }
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    onChange();
    setMotionReady(true);
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  /* ------------------------------------------------------------- entrance */
  useEffect(() => {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(showPage);
    } else {
      showPage();
    }
    const t = setTimeout(showPage, 2500);
    return () => clearTimeout(t);
  }, []);

  /* ----------------------------------------------------------- diagnostic */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Defensive: other agents extend window.__plate too. Merge rather than
    // clobber, and stay `configurable` so a later definition can win.
    let base = {};
    try {
      if (window.__plate && typeof window.__plate === 'object') {
        Object.defineProperties(
          base,
          Object.getOwnPropertyDescriptors(window.__plate)
        );
      }
    } catch (e) {
      base = {};
    }

    Object.defineProperties(base, {
      map: {
        configurable: true,
        enumerable: true,
        get() {
          return {
            titleOut,
            titleIn,
            wipe: metrics.wipe,
            A,
            B,
            runwayPx: metrics.runwayPx,
            vw: metrics.vw,
            vh: metrics.vh,
          };
        },
      },
      metrics: {
        configurable: true,
        enumerable: true,
        get() {
          return metrics;
        },
      },
      p: {
        configurable: true,
        enumerable: true,
        writable: true,
        value: () => progress.get(),
      },
      progress: {
        configurable: true,
        enumerable: true,
        get() {
          return progress;
        },
      },
      // Drive every writer to an arbitrary p without scrolling. Needed because
      // progress is only refreshed from scroll events, which don't fire in
      // hidden panes or under headless capture. Everything downstream derives
      // from this MotionValue, so a set() propagates synchronously.
      drive: {
        configurable: true,
        enumerable: true,
        writable: true,
        value: (v) => {
          const next = clamp01(Number(v) || 0);
          progress.set(next);
          return next;
        },
      },
    });

    try {
      Object.defineProperty(window, '__plate', {
        value: base,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    } catch (e) {
      /* a frozen window.__plate from an earlier build — nothing to do */
    }
  }, [metrics, progress]);

  const value = useMemo(
    () => ({ progress, metrics, reduced, motionReady }),
    [progress, metrics, reduced, motionReady]
  );

  return <PlateContext.Provider value={value}>{children}</PlateContext.Provider>;
}

export default PlateProvider;
