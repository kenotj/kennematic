'use client';

/* PLATE® — shared scrub engine.
 *
 * One rAF loop drives all three plate layers (stage + reveal A + reveal B).
 * One frame bank is built (from layer 0) and shared by all three, because the
 * three layers are the same continuous plate offset by WIPE_LEAD seconds.
 *
 * Ported from legacy/main.js: `createClip`, `updateScrub`, the rAF `frame`
 * loop and the `__plate` diagnostic. Timing math is verbatim.
 *
 * Two behavioural fixes over legacy:
 *   1. Video-fallback seek thrash — legacy assigned `video.currentTime` on
 *      every frame where |Δ| > 0.01, on all three videos at once, queueing new
 *      seeks while previous ones were still in flight. Here each layer keeps a
 *      `seeking` flag, set on assignment and cleared on `seeked`, so at most
 *      one seek per video is ever outstanding.
 *   2. Prefetch is directional — the measured per-layer velocity is handed to
 *      `bank.prefetch(t, velocity)` so the decoder warms ahead of travel.
 */

import { useEffect, useState } from 'react';
import { useMotionValue } from 'framer-motion';

import { usePlate } from './plate.jsx';
import { createFrameBank } from './frameBank.js';
import { clamp01 } from './easing.js';
import { A, B, LERP_TAU, SNAP, WIPE_LEAD, VIDEO_SRC } from './constants.js';

const SEEK_EPS = 0.01;
const SEEK_WATCHDOG = 1000; /* ms — a seek that never fires `seeked` unblocks */
/* ms the frame bank outlives its last layer. It must survive StrictMode
 * remounts (tens of ms) — and a trip to a sub-page and back, which is the
 * expensive case: rebuilding means refetching and re-decoding the whole plate,
 * so the landing would crossfade in on a black canvas and pop to the film a
 * second later. What it holds meanwhile is the WebP blob set plus a bounded
 * 32-bitmap LRU, the same footprint it has while the landing is on screen. */
const BANK_IDLE_DESTROY = 120000;
const PAINT_FAILURE_LIMIT = 4;
const PAINT_RETRY_BASE_MS = 80;
const PAINT_RETRY_MAX_MS = 1000;
const FAST_SCROLL_RATE = 0.75; /* normalized runway lengths / second */
const DIRECT_GAP_FRAC = 0.06; /* fraction of the usable video span */
const DIRECT_TAU = 140; /* ~90% convergence in one 60 Hz frame */

/* ------------------------------------------------------------------ engine */

const engine = {
  layers: [null, null, null],
  count: 0,
  raf: 0,
  lastT: 0,
  lastP: 0,
  hasLastP: false,
  progress: null,
  metrics: null,
  reduced: false,
  bank: null,
  bankBuilding: false,
  bankTimer: 0,
  /* Blob URL of the mp4 the bank already downloaded, shared by every layer's
     <video>. Null until the download lands (or, if the bank cannot build at
     all, replaced by VIDEO_SRC so the fallback still has something to seek). */
  videoSrc: null,
};

function duration() {
  const bank = engine.bank;
  if (bank && bank.dur) return bank.dur;
  const l0 = engine.layers[0];
  return (l0 && l0.dur) || 0;
}

/* ------------------------------------------------------------------- layer */

function createLayer(index, video, canvas) {
  const L = {
    index,
    video: video || null,
    canvas: canvas || null,
    ctx: canvas ? canvas.getContext('2d', { alpha: false }) : null,
    t: 0,
    target: 0,
    primed: false,
    vel: 0,
    cur: -1,
    painted: false,
    ready: false,
    dur: 0,
    visible: index === 0,
    seeking: false,
    seekTo: 0,
    seekIssued: 0,
    seekAt: 0,
    paintFailures: 0,
    paintRetryAt: 0,
    cleanup: null,
  };

  if (video) {
    const onMeta = () => {
      L.dur = video.duration || 0;
      L.ready = true;
      /* the bank is authoritative about duration; report ours up */
      if (engine.bank && typeof engine.bank.setDuration === 'function' && L.dur) {
        engine.bank.setDuration(L.dur);
      }
      try { video.currentTime = 0.001; } catch (e) { /* ignore */ }
      video.pause();
    };
    const onSeeked = () => {
      L.seeking = false;
      // A scroll update may have superseded the destination that just landed.
      // Start that latest seek in this task instead of waiting for another rAF.
      if (Math.abs(video.currentTime - L.seekTo) > SEEK_EPS) {
        issueSeek(L, L.seekTo);
      }
    };
    const onError = () => { L.seeking = false; };

    if (video.readyState >= 1) onMeta();
    else video.addEventListener('loadedmetadata', onMeta, { once: true });
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);

    L.cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
  }

  if (canvas) {
    const priorCleanup = L.cleanup;
    const onContextLost = () => fallbackToVideo();
    canvas.addEventListener('contextlost', onContextLost);
    L.cleanup = () => {
      if (priorCleanup) priorCleanup();
      canvas.removeEventListener('contextlost', onContextLost);
    };
  }

  return L;
}

/* Every <video> ships with `preload="none"` and no src: the file is fetched
 * once, by the frame bank, and handed to the layers here. Before that the
 * poster attribute holds the frame. */
/* Layers subscribe so the source lands through React, not as a DOM write.
 * Writing `video.src` / `video.preload` imperatively loses: the provider's
 * `motionReady` flip re-renders every layer moments later and React re-asserts
 * `preload="none"` from the JSX, aborting the load that had just started. */
const sourceSubscribers = new Set();

function setVideoSource(url) {
  if (!url || engine.videoSrc === url) return;
  engine.videoSrc = url;
  for (const notify of sourceSubscribers) notify(url);
}

function issueSeek(L, t) {
  const video = L.video;
  if (!video) return;
  L.seekIssued = t;
  L.seekAt = performance.now();
  L.seeking = true;
  try { video.currentTime = t; } catch (e) { L.seeking = false; }
}

function showVideoFallback(L) {
  if (!L.canvas) return;
  L.canvas.classList.remove('is-live');
  L.painted = false;
  L.cur = -1;
}

function fallbackToVideo() {
  const bank = engine.bank;
  if (bank && bank.mode === 'bank' && typeof bank.fallback === 'function') {
    bank.fallback();
  }
  for (const layer of engine.layers) {
    if (layer) showVideoFallback(layer);
  }
}

function recordPaintFailure(L) {
  const now = performance.now();
  if (now < L.paintRetryAt) return;
  L.paintFailures++;
  if (L.paintFailures >= PAINT_FAILURE_LIMIT) {
    fallbackToVideo();
    return;
  }
  const delay = Math.min(
    PAINT_RETRY_MAX_MS,
    PAINT_RETRY_BASE_MS * 2 ** (L.paintFailures - 1)
  );
  L.paintRetryAt = now + delay;
}

function drawLayer(L, t) {
  const bank = engine.bank;

  /* ---- bank mode: decoded frames, no seeking at all ---- */
  if (bank && bank.mode === 'bank' && bank.ready) {
    const now = performance.now();
    if (now < L.paintRetryAt) return;
    if (!L.ctx) {
      recordPaintFailure(L);
      return;
    }
    if (typeof L.ctx.isContextLost === 'function' && L.ctx.isContextLost()) {
      fallbackToVideo();
      return;
    }
    if (typeof bank.prefetch === 'function') bank.prefetch(t, L.vel);
    const i = bank.nearestIndex(t);
    if (i < 0) return;
    if (i === L.cur) return;
    let paintedIndex = i;
    let bmp = bank.acquire(i);
    if (!bmp && typeof bank.acquireNearest === 'function') {
      const nearest = bank.acquireNearest(i);
      if (nearest) {
        paintedIndex = nearest.index;
        bmp = nearest.bitmap;
      }
    }
    if (!bmp || paintedIndex === L.cur) return;
    try {
      L.ctx.drawImage(bmp, 0, 0, L.canvas.width, L.canvas.height);
    } catch (e) {
      recordPaintFailure(L);
      return;
    }
    L.paintFailures = 0;
    L.paintRetryAt = 0;
    L.cur = paintedIndex;
    if (!L.painted) {
      L.painted = true;              /* first REAL paint only */
      L.canvas.classList.add('is-live');
    }
    return;
  }

  /* ---- video fallback: at most one outstanding seek per video ---- */
  showVideoFallback(L);
  const video = L.video;
  if (!video || !L.ready) return;

  // Always retain the newest target, including while an older seek is active.
  L.seekTo = t;

  if (L.seeking) {
    const landed =
      (!video.seeking && Math.abs(video.currentTime - L.seekIssued) <= SEEK_EPS) ||
      performance.now() - L.seekAt > SEEK_WATCHDOG;
    if (!landed) return;
    L.seeking = false;
  }

  if (Math.abs(video.currentTime - L.seekTo) > SEEK_EPS) {
    issueSeek(L, L.seekTo);
  }
}

/* -------------------------------------------------------------------- loop */

function frame(now) {
  engine.raf = requestAnimationFrame(frame);

  const dt = engine.lastT ? Math.min(0.1, (now - engine.lastT) / 1000) : 1 / 60;
  engine.lastT = now;

  const p = engine.progress ? clamp01(engine.progress.get()) : 0;
  const inputVelocity = engine.hasLastP && dt > 0
    ? Math.abs(p - engine.lastP) / dt
    : Math.abs(p) / dt;
  engine.lastP = p;
  engine.hasLastP = true;
  const wipe = (engine.metrics && engine.metrics.wipe) || 0.1;

  /* same visibility rule as legacy updateReveals */
  const ra = clamp01((p - A) / wipe);
  const rb = clamp01((p - B) / wipe);
  const visible = [ra < 1, ra > 0 && rb < 1, rb > 0];

  const dur = duration();
  if (!dur) return;

  const span = Math.max(0.001, dur - 2 * WIPE_LEAD);
  const speedUrgency = clamp01(inputVelocity / FAST_SCROLL_RATE);

  for (let i = 0; i < 3; i++) {
    const L = engine.layers[i];
    if (!L) continue;

    const target = engine.reduced ? 0 : Math.min(dur, p * span + i * WIPE_LEAD);
    L.target = target;

    /* A layer's very first frame lands on the target outright. Mounting at a
       restored scroll position (sub-page close button) otherwise starts every
       layer at t = 0 and eases up to the real time — the film visibly scrubs
       from its first frame to where you left it. */
    if (!L.primed) {
      L.primed = true;
      L.t = target;
      L.vel = 0;
      L.visible = visible[i];
      if (L.visible) drawLayer(L, L.t);
      continue;
    }

    const prev = L.t;
    const gap = Math.abs(target - L.t);
    const gapUrgency = clamp01(gap / (span * DIRECT_GAP_FRAC));
    const urgency = Math.max(speedUrgency, gapUrgency);
    const tau = LERP_TAU + (DIRECT_TAU - LERP_TAU) * urgency;
    const k = 1 - Math.exp(-dt * tau);
    if (Math.abs(target - L.t) < SNAP) L.t = target;
    else L.t += (target - L.t) * k;
    L.vel = dt > 0 ? (L.t - prev) / dt : 0;

    L.visible = visible[i];
    if (L.visible) drawLayer(L, L.t);   /* render only visible layers */
  }
}

function startLoop() {
  if (engine.raf) return;
  engine.lastT = 0;
  engine.lastP = 0;
  engine.hasLastP = false;
  engine.raf = requestAnimationFrame(frame);
}

function stopLoop() {
  if (!engine.raf) return;
  cancelAnimationFrame(engine.raf);
  engine.raf = 0;
  engine.lastT = 0;
  engine.lastP = 0;
  engine.hasLastP = false;
}

/* -------------------------------------------------------------------- bank */

function ensureBank() {
  clearTimeout(engine.bankTimer);
  if (engine.bank || engine.bankBuilding) return;
  engine.bankBuilding = true;

  let bank;
  try {
    // signature is createFrameBank(src, opts) — passing an options object as the
    // first arg silently fetches "[object Object]" and degrades to video scrub.
    bank = createFrameBank(VIDEO_SRC, { reduced: engine.reduced, onSource: setVideoSource });
  } catch (e) {
    engine.bankBuilding = false;
    return;
  }
  engine.bank = bank;

  const l0 = engine.layers[0];
  if (l0 && l0.dur && typeof bank.setDuration === 'function') bank.setDuration(l0.dur);

  Promise.resolve(bank.build())
    .then(() => {
      engine.bankBuilding = false;
      /* force a repaint on every layer with the newly available frames */
      for (const L of engine.layers) if (L) { L.cur = -1; }
      /* No WebCodecs, or the build failed before the fetch: the layers still
         have no source. Point them at the network file so the <video> scrub
         path works rather than leaving every layer on the poster. */
      if (!engine.videoSrc) setVideoSource(VIDEO_SRC);
    })
    .catch(() => {
      engine.bankBuilding = false;
      if (!engine.videoSrc) setVideoSource(VIDEO_SRC);
    });
}

function releaseBank() {
  clearTimeout(engine.bankTimer);
  engine.bankTimer = setTimeout(() => {
    if (engine.count > 0) return;
    const bank = engine.bank;
    engine.bank = null;
    engine.bankBuilding = false;
    if (bank && typeof bank.destroy === 'function') { try { bank.destroy(); } catch (e) {} }
    /* every layer is gone by now, so nothing is still reading the blob */
    if (engine.videoSrc && engine.videoSrc.startsWith('blob:')) {
      try { URL.revokeObjectURL(engine.videoSrc); } catch (e) {}
      engine.videoSrc = null;
    }
  }, BANK_IDLE_DESTROY);
}

/* --------------------------------------------------------------------- API */

/**
 * useScrub(index, { videoRef, canvasRef })
 *
 * Registers one plate layer with the shared engine.
 *   index      0 = stage, 1 = reveal A, 2 = reveal B (drives the WIPE_LEAD offset)
 *   videoRef   ref to the layer's <video> (fallback path + duration source)
 *   canvasRef  ref to the layer's <canvas class="plate"> (bank path)
 *
 * Returns the plate's video source (or null while it is still coming down):
 * render it as the layer's <video src>, with preload driven off the same
 * value. All painting stays imperative, outside React's render cycle.
 * The engine reads `progress` / `metrics` / `reduced` from usePlate(); the
 * first-registered layer seeds them and the rAF loop starts on first mount and
 * stops when the last layer unmounts.
 */
export function useScrub(index, { videoRef, canvasRef }) {
  const { progress, metrics, reduced, motionReady } = usePlate();

  /* null until the plate's bytes are available — see setVideoSource. The
     layer renders its poster until then. */
  const [videoSrc, setVideoSrc] = useState(engine.videoSrc);

  useEffect(() => {
    setVideoSrc(engine.videoSrc);
    sourceSubscribers.add(setVideoSrc);
    return () => { sourceSubscribers.delete(setVideoSrc); };
  }, []);

  useEffect(() => {
    const layer = createLayer(index, videoRef.current, canvasRef.current);

    engine.progress = progress;
    engine.metrics = metrics;
    engine.reduced = !!reduced;
    engine.layers[index] = layer;
    engine.count += 1;

    /* one continuous plate: build the bank once, from layer 0, share it */
    if (index === 0 && motionReady && !reduced) ensureBank();

    exposeDiagnostics();
    startLoop();

    return () => {
      if (engine.layers[index] === layer) engine.layers[index] = null;
      if (layer.cleanup) layer.cleanup();
      engine.count = Math.max(0, engine.count - 1);
      if (engine.count === 0) { stopLoop(); releaseBank(); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, progress, metrics, reduced, motionReady, videoSrc]);

  return videoSrc;
}

/**
 * useRevealValue(start)
 *
 * MotionValue of `clamp01((p - start) / metrics.wipe)` — the linear, un-eased
 * wipe progress of one reveal layer (start = A or B). Recomputes on scroll and
 * on remeasure, and never touches React state.
 */
export function useRevealValue(start) {
  const { progress, metrics } = usePlate();
  const value = useMotionValue(0);

  useEffect(() => {
    const compute = () => {
      const wipe = metrics.wipe || 0.1;
      value.set(clamp01((progress.get() - start) / wipe));
    };
    compute();
    const offP = progress.on('change', compute);
    const offM = typeof metrics.subscribe === 'function' ? metrics.subscribe(compute) : null;
    return () => {
      if (typeof offP === 'function') offP();
      if (typeof offM === 'function') offM();
    };
  }, [progress, metrics, value, start]);

  return value;
}

/* -------------------------------------------------------------- diagnostic */

let diagInstalled = false;

function exposeDiagnostics() {
  if (diagInstalled) return;

  const extra = {
    clips: {
      get() { return engine.layers.filter(Boolean); },
      configurable: true,
      enumerable: true,
    },
    seek: {
      value: function seek(i, t) {
        const L = engine.layers[i];
        if (!L) return false;
        L.t = t;
        drawLayer(L, t);
        return true;
      },
      configurable: true,
      enumerable: true,
      writable: true,
    },
  };

  /* another module owns __plate — merge defensively, never clobber */
  const host = typeof window !== 'undefined' ? window : null;
  if (!host) return;

  const current = host.__plate;
  if (current && typeof current === 'object') {
    let merged = true;
    for (const key of Object.keys(extra)) {
      if (key in current) continue;
      try { Object.defineProperty(current, key, extra[key]); } catch (e) { merged = false; }
    }
    if (merged) { diagInstalled = true; return; }

    /* frozen / non-extensible: try replacing the binding with a superset */
    try {
      const clone = {};
      for (const key of Object.keys(current)) {
        const d = Object.getOwnPropertyDescriptor(current, key);
        Object.defineProperty(clone, key, { ...d, configurable: true });
      }
      for (const key of Object.keys(extra)) {
        if (key in clone) continue;
        Object.defineProperty(clone, key, extra[key]);
      }
      Object.defineProperty(host, '__plate', {
        value: clone, writable: false, configurable: true,
      });
      diagInstalled = true;
      return;
    } catch (e) { /* fall through */ }

    /* last resort — never lose the handles */
    try {
      host.__plateScrub = Object.defineProperties({}, extra);
      diagInstalled = true;
    } catch (e) {}
    return;
  }

  try {
    Object.defineProperty(host, '__plate', {
      value: Object.defineProperties({}, extra),
      writable: false,
      configurable: true,
    });
  } catch (e) { /* ignore */ }
}

export default useScrub;
