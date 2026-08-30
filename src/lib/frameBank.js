/* PLATE® — frame bank
 *
 * Ported from legacy/main.js (`createClip` / `fetchAndDemux` / `decodeAll` /
 * `descriptionFor`) and hardened for scrub performance.
 *
 * One 13s mp4 is demuxed with MP4Box, decoded through WebCodecs, and every
 * frame is re-encoded to a WebP blob. A bounded LRU of ImageBitmaps is kept
 * warm around the playhead so `acquire()` can hand a layer a bitmap
 * synchronously inside its rAF paint. Framework-agnostic: no React here.
 *
 * Three canvas layers share ONE bank instance (their playheads are offset by
 * WIPE_LEAD seconds), so every sizing decision below assumes three clusters.
 *
 * Any failure leaves `mode === 'video'` so the caller's raw <video>
 * currentTime scrubbing stays viable. `build()` never throws.
 */

import MP4Box from 'mp4box';
import { LEAD, WATCHDOG } from './constants.js';

/* Canvas dimensions — load-bearing, matches legacy. */
const FRAME_W = 1280;
const FRAME_H = 720;

/* ---------------------------------------------------------- cache sizing --
 *
 * Memory math. An ImageBitmap decoded from a 1280x720 WebP costs, worst case,
 * 1280 * 720 * 4 bytes = 3.69 MB of RGBA (UAs usually keep it GPU-side and
 * often in a cheaper format, so this is an upper bound).
 *
 * The cache is shared by all three layers, so its cap is the total decoded
 * bitmap budget. Keep the resident set near the frames that can actually be
 * painted next instead of retaining all three speculative prefetch windows.
 * 32 frames is ~118 MB worst case; constrained/save-data devices use 24
 * (~88 MB).
 */
const LRU_MAX = 32;
const LRU_MAX_CONSTRAINED = 24;

/* Prefetch window, in frames, per playhead. Asymmetric and velocity-biased:
 * a few behind (for scroll jitter / direction flips), substantially more in
 * the direction of travel. */
const BEHIND_MIN = 2;
const BEHIND_MAX = 4;
const AHEAD_MIN = 8;
const AHEAD_MAX = 16;
/* Wall-clock seconds of travel we try to stay ahead of. */
const LOOKAHEAD_SEC = 0.35;

/* Bounded createImageBitmap concurrency — never fire 60 at once on a fast
 * scrub; that is what starves the compositor. */
const MAX_INFLIGHT = 6;
/* Queue is bounded too; far-away requests get dropped rather than piling up. */
const QUEUE_MAX = 128;
/* A queued/resolved bitmap this far (in frames) from every live playhead is
 * stale: drop the request, or close the bitmap instead of caching it. */
const STALE_DIST = 48;

/* Frames warmed around t=0 the moment build() finishes, so the first scroll
 * after decode never misses. */
const PREWARM = 20;

/* Bound both halves of the build pipeline. decodeQueueSize limits work held by
 * VideoDecoder; LEAD slots are reserved before decode() so decoded frames plus
 * active toBlob() conversions can never run away from the submission loop. */
const DECODE_QUEUE_MAX = 6;

/* A corrupt blob or a browser-wide createImageBitmap failure must not retry on
 * every rAF forever. Retries are per frame index so unrelated successes cannot
 * hide one persistently bad frame. */
const BITMAP_FAILURE_LIMIT = 4;
const BITMAP_GLOBAL_FAILURE_LIMIT = 8;
const BITMAP_RETRY_BASE_MS = 80;
const BITMAP_RETRY_MAX_MS = 1000;

/* ------------------------------------------------------------------ demux */

function descriptionFor(file, trackId) {
  const trak = file.getTrackById(trackId);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const s = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
      box.write(s);
      return new Uint8Array(s.buffer, 8);
    }
  }
  return null;
}

function fetchAndDemux(src) {
  return new Promise((resolve, reject) => {
    const file = MP4Box.createFile();
    const samples = [];
    let info = null;

    file.onError = (e) => reject(new Error('mp4box: ' + e));
    file.onReady = (i) => {
      const track = i.videoTracks && i.videoTracks[0];
      if (!track) { reject(new Error('no video track')); return; }
      info = {
        track,
        timescale: track.timescale,
        duration: i.duration / i.timescale,
        description: descriptionFor(file, track.id),
        codec: track.codec,
        width: track.video.width,
        height: track.video.height,
      };
      file.setExtractionOptions(track.id, null, { nbSamples: Infinity });
      file.start();
    };
    file.onSamples = (_id, _user, list) => { for (const s of list) samples.push(s); };

    fetch(src).then((r) => {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    }).then((buf) => {
      buf.fileStart = 0;
      file.appendBuffer(buf);
      file.flush();
      if (!info) { reject(new Error('no info')); return; }
      if (!samples.length) { reject(new Error('no samples')); return; }
      info.samples = samples;
      resolve(info);
    }).catch(reject);
  });
}

/* ----------------------------------------------------------------- decode */

/* PERF FIX 1 — the legacy backpressure was:
 *
 *     while (live >= LEAD) await Promise.race(jobs.slice(-LEAD));
 *
 * inside the per-sample loop. `jobs` grows to one entry per frame (~390), so
 * every sample reallocated a 24-element slice AND rebuilt a Promise.race with
 * 24 fresh subscriptions — O(n) allocation churn per sample, on the same task
 * queue as the encode callbacks.
 *
 * Replaced with a counting semaphore that reserves a slot before decode()
 * submission. A released slot is handed directly to one waiter, so the count
 * can never briefly dip below the cap and wake a whole batch.
 */
function makeSemaphore(limit) {
  let live = 0;
  const waiters = [];
  const drainWaiters = [];
  let cancelled = false;

  const wakeDrained = () => {
    if (live !== 0) return;
    while (drainWaiters.length) drainWaiters.shift()();
  };

  return {
    get live() { return live; },
    async acquire() {
      if (cancelled) return false;
      if (live < limit) {
        live++;
        return true;
      }
      return new Promise((resolve) => waiters.push(resolve));
    },
    release() {
      if (cancelled) return;
      const next = waiters.shift();
      if (next) {
        // Transfer this slot without changing `live`.
        next(true);
        return;
      }
      live = Math.max(0, live - 1);
      wakeDrained();
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      live = 0;
      while (waiters.length) waiters.shift()(false);
      wakeDrained();
    },
    async drain() {
      if (live > 0) await new Promise((resolve) => drainWaiters.push(resolve));
    },
  };
}

async function decodeAll(demux, hardwareAcceleration, isStale) {
  const off = document.createElement('canvas');
  off.width = FRAME_W;
  off.height = FRAME_H;
  const octx = off.getContext('2d', { alpha: false });

  const bank = [];
  const sem = makeSemaphore(LEAD);
  let failed = null;
  let dequeueWaiters = [];

  const wakeDequeueWaiters = () => {
    if (!dequeueWaiters.length) return;
    const waiting = dequeueWaiters;
    dequeueWaiters = [];
    for (const resolve of waiting) resolve();
  };

  const decoder = new VideoDecoder({
    output: (frame) => {
      const ts = frame.timestamp / 1e6;
      // Run token guard: a superseded run must not keep encoding frames.
      if (isStale()) {
        try { frame.close(); } catch (e) { /* ignore */ }
        sem.release();
        return;
      }
      try {
        octx.drawImage(frame, 0, 0, FRAME_W, FRAME_H);
        frame.close();
        off.toBlob((blob) => {
          if (blob && !isStale()) bank.push({ ts, blob });
          sem.release();
        }, 'image/webp', 0.82);
      } catch (e) {
        try { frame.close(); } catch (closeError) { /* ignore */ }
        failed = e;
        sem.release();
        wakeDequeueWaiters();
      }
    },
    error: (e) => {
      failed = e;
      sem.cancel();
      wakeDequeueWaiters();
    },
  });
  decoder.addEventListener('dequeue', wakeDequeueWaiters);

  const cfg = {
    codec: demux.codec,
    codedWidth: demux.width,
    codedHeight: demux.height,
    hardwareAcceleration,
  };
  if (demux.description) cfg.description = demux.description;
  decoder.configure(cfg);

  const waitForDecoderCapacity = async () => {
    while (
      !failed &&
      !isStale() &&
      decoder.decodeQueueSize >= DECODE_QUEUE_MAX
    ) {
      await new Promise((resolve) => {
        dequeueWaiters.push(resolve);
        // Close the event-registration race if the queue drained immediately.
        if (decoder.decodeQueueSize < DECODE_QUEUE_MAX || failed || isStale()) {
          wakeDequeueWaiters();
        }
      });
    }
  };

  const ts = demux.timescale;
  for (const s of demux.samples) {
    if (failed) break;
    if (isStale()) break;
    await waitForDecoderCapacity();
    if (failed || isStale()) break;
    const acquired = await sem.acquire();
    if (!acquired || failed || isStale()) {
      if (acquired) sem.release();
      break;
    }
    try {
      decoder.decode(new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: (s.cts / ts) * 1e6,
        duration: (s.duration / ts) * 1e6,
        data: s.data,
      }));
    } catch (e) {
      sem.release();
      throw e;
    }
  }

  if (failed) { try { decoder.close(); } catch (e) { /* ignore */ } throw failed; }
  await decoder.flush();
  await sem.drain();
  decoder.removeEventListener('dequeue', wakeDequeueWaiters);
  try { decoder.close(); } catch (e) { /* ignore */ }
  if (failed) throw failed;
  return bank;
}

/* -------------------------------------------------------------- the bank -- */

export function createFrameBank(src, { reduced = false } = {}) {
  /* [{ts, blob}] sorted by ts, or null while in video mode. */
  let frames = null;
  let dur = 0;
  let ready = false;
  let mode = 'video';
  let building = false;

  /* Run token. Bumped by every build() and by destroy(); anything that
   * resolves with a stale token closes its resources instead of landing. */
  let token = 0;

  /* index -> ImageBitmap, insertion-ordered => LRU by Map key order. */
  const lru = new Map();
  /* Indices queued or in flight through createImageBitmap. */
  const pending = new Set();
  /* Bounded work queue of indices, nearest-to-playhead first at dispatch. */
  let queue = [];
  let inflight = 0;
  const bitmapFailures = new Map();
  let consecutiveBitmapFailures = 0;
  let bitmapRetryAt = 0;
  let bitmapRetryTimer = 0;

  const nav = typeof navigator === 'undefined' ? null : navigator;
  const constrained = !!(
    (nav && typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) ||
    (nav && nav.connection && nav.connection.saveData)
  );
  const lruMax = constrained ? LRU_MAX_CONSTRAINED : LRU_MAX;

  /* Live playheads (one per layer). Used to score queue entries and to decide
   * whether a resolved bitmap is still worth caching. */
  const focus = [];

  function noteFocus(i) {
    const at = focus.indexOf(i);
    if (at !== -1) { focus.splice(at, 1); }
    focus.unshift(i);
    // three canvas layers -> at most three meaningful playheads
    if (focus.length > 3) focus.length = 3;
  }

  function distToFocus(i) {
    if (!focus.length) return 0;
    let best = Infinity;
    for (let k = 0; k < focus.length; k++) {
      const d = Math.abs(focus[k] - i);
      if (d < best) best = d;
    }
    return best;
  }

  function touch(i) {
    const hit = lru.get(i);
    if (hit === undefined) return null;
    lru.delete(i);
    lru.set(i, hit);
    return hit;
  }

  function insert(i, bmp) {
    lru.set(i, bmp);
    while (lru.size > lruMax) {
      const oldest = lru.keys().next().value;
      const dead = lru.get(oldest);
      lru.delete(oldest);
      if (dead !== bmp) { try { dead.close(); } catch (e) { /* ignore */ } }
    }
  }

  function retryBlocked(i) {
    const state = bitmapFailures.get(i);
    const now = performance.now();
    return now < bitmapRetryAt || (!!state && now < state.retryAt);
  }

  function schedulePump() {
    if (bitmapRetryTimer || mode !== 'bank') return;
    const delay = Math.max(0, bitmapRetryAt - performance.now());
    bitmapRetryTimer = setTimeout(() => {
      bitmapRetryTimer = 0;
      pump();
    }, delay);
  }

  function recordBitmapFailure(i) {
    const previous = bitmapFailures.get(i);
    const count = (previous ? previous.count : 0) + 1;
    consecutiveBitmapFailures++;
    if (
      count >= BITMAP_FAILURE_LIMIT ||
      consecutiveBitmapFailures >= BITMAP_GLOBAL_FAILURE_LIMIT
    ) {
      revert();
      return;
    }
    const delay = Math.min(
      BITMAP_RETRY_MAX_MS,
      BITMAP_RETRY_BASE_MS * 2 ** (consecutiveBitmapFailures - 1)
    );
    const retryAt = performance.now() + delay;
    bitmapRetryAt = Math.max(bitmapRetryAt, retryAt);
    bitmapFailures.set(i, { count, retryAt });
    schedulePump();
  }

  /* PERF FIX 3 — bounded, cancellable decode. Requests are scored against the
   * live playheads at DISPATCH time (not enqueue time), so a burst queued
   * during a fast scrub is re-prioritised for free once the playhead moves,
   * and anything now far away is dropped. Resolved bitmaps that no longer
   * matter are closed rather than cached. */
  function pump() {
    if (performance.now() < bitmapRetryAt) {
      schedulePump();
      return;
    }
    while (inflight < MAX_INFLIGHT && queue.length) {
      // pick nearest-to-any-playhead; queue is bounded so the scan is cheap
      let bestAt = 0;
      let bestD = distToFocus(queue[0]);
      for (let k = 1; k < queue.length; k++) {
        const d = distToFocus(queue[k]);
        if (d < bestD) { bestD = d; bestAt = k; }
      }
      const i = queue[bestAt];
      queue[bestAt] = queue[queue.length - 1];
      queue.pop();

      if (lru.has(i)) { pending.delete(i); continue; }
      if (bestD > STALE_DIST) { pending.delete(i); continue; }
      if (!frames || i < 0 || i >= frames.length) { pending.delete(i); continue; }

      inflight++;
      const tok = token;
      createImageBitmap(frames[i].blob).then((bmp) => {
        inflight--;
        pending.delete(i);
        const stale = tok !== token || mode !== 'bank' || distToFocus(i) > STALE_DIST;
        if (stale) { try { bmp.close(); } catch (e) { /* ignore */ } }
        else {
          consecutiveBitmapFailures = 0;
          bitmapRetryAt = 0;
          bitmapFailures.delete(i);
          insert(i, bmp);
        }
        pump();
      }).catch(() => {
        inflight--;
        pending.delete(i);
        if (tok === token && mode === 'bank') recordBitmapFailure(i);
        pump();
      });
    }
  }

  function request(i) {
    if (!frames || i < 0 || i >= frames.length) return;
    if (lru.has(i) || pending.has(i)) return;
    if (retryBlocked(i)) return;
    if (queue.length >= QUEUE_MAX) {
      // drop the farthest queued request to make room
      let worstAt = 0;
      let worstD = distToFocus(queue[0]);
      for (let k = 1; k < queue.length; k++) {
        const d = distToFocus(queue[k]);
        if (d > worstD) { worstD = d; worstAt = k; }
      }
      if (worstD <= distToFocus(i)) return;
      pending.delete(queue[worstAt]);
      queue[worstAt] = queue[queue.length - 1];
      queue.pop();
    }
    pending.add(i);
    queue.push(i);
    pump();
  }

  function fps() {
    if (!frames || !frames.length || !dur) return 30;
    return frames.length / dur;
  }

  function revert() {
    token++;
    mode = 'video';
    frames = null;
    queue = [];
    pending.clear();
    bitmapFailures.clear();
    consecutiveBitmapFailures = 0;
    bitmapRetryAt = 0;
    clearTimeout(bitmapRetryTimer);
    bitmapRetryTimer = 0;
    for (const bmp of lru.values()) { try { bmp.close(); } catch (e) { /* ignore */ } }
    lru.clear();
  }

  function nearestIndex(t) {
    if (!frames || !frames.length) return -1;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].ts < t) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(frames[lo - 1].ts - t) <= Math.abs(frames[lo].ts - t)) lo--;
    return lo;
  }

  /* PERF FIX 2 — velocity-aware asymmetric warm window. Legacy warmed -1..+2
   * with a 24-entry LRU, so any brisk scrub outran the cache, acquire() missed
   * and the canvas held a stale frame. We now warm a few frames behind and up
   * to AHEAD_MAX in the direction of travel, scaled by |velocity|. */
  function prefetch(t, velocity) {
    if (mode !== 'bank' || !frames || !frames.length) return;
    const i = nearestIndex(t);
    if (i < 0) return;
    noteFocus(i);

    const v = typeof velocity === 'number' && isFinite(velocity) ? velocity : 0;
    const dir = v < 0 ? -1 : 1;
    // frames of video travelled per wall-clock second
    const framesPerSec = Math.abs(v) * fps();
    const want = Math.round(framesPerSec * LOOKAHEAD_SEC);
    const ahead = Math.max(AHEAD_MIN, Math.min(AHEAD_MAX, want));
    const behind = Math.abs(v) > 0.25
      ? BEHIND_MIN
      : BEHIND_MAX;

    // nearest first, so the queue's initial order already matches priority
    request(i);
    const span = Math.max(ahead, behind);
    for (let d = 1; d <= span; d++) {
      if (d <= ahead) request(i + d * dir);
      if (d <= behind) request(i - d * dir);
    }
  }

  /* Always synchronous. Returns a resident bitmap or null, and kicks off an
   * async decode on a miss. Never returns a promise. */
  function acquire(i) {
    if (mode !== 'bank' || !frames || i < 0 || i >= frames.length) return null;
    const hit = touch(i);
    if (hit) return hit;
    noteFocus(i);
    request(i);
    return null;
  }

  /* Return the closest resident frame without hiding which index was chosen.
   * The caller records that actual index as its painted frame. */
  function acquireNearest(i) {
    if (mode !== 'bank' || !lru.size) return null;
    let best = -1;
    let bestDistance = Infinity;
    for (const cached of lru.keys()) {
      const distance = Math.abs(cached - i);
      if (distance < bestDistance) {
        best = cached;
        bestDistance = distance;
      }
    }
    if (best < 0) return null;
    const bitmap = touch(best);
    return bitmap ? { index: best, bitmap } : null;
  }

  async function build() {
    /* prefers-reduced-motion: never build, stay on the <video> path. */
    if (reduced) return false;
    if (typeof VideoDecoder === 'undefined' || typeof window === 'undefined') return false;
    if (building) return mode === 'bank';
    building = true;

    const tok = ++token;
    const isStale = () => tok !== token;

    let watchdog;
    const guard = new Promise((_, rej) => {
      watchdog = setTimeout(() => rej(new Error('watchdog')), WATCHDOG);
    });

    // --- stage 1: fetch + demux. Failures here revert outright, no retry.
    let demux;
    try {
      demux = await Promise.race([fetchAndDemux(src), guard]);
    } catch (e) {
      clearTimeout(watchdog);
      building = false;
      if (!isStale()) revert();
      return false;
    }

    // --- stage 2: decode. Exactly ONE retry with software decoding, which
    // works around hidden-tab hardware decoder refusal.
    for (const accel of ['no-preference', 'prefer-software']) {
      try {
        const bank = await Promise.race([decodeAll(demux, accel, isStale), guard]);
        clearTimeout(watchdog);
        building = false;
        if (isStale()) return false;              // a newer run superseded us
        if (!bank.length) { revert(); return false; }
        bank.sort((a, b) => a.ts - b.ts);
        frames = bank;
        dur = demux.duration || dur;
        ready = true;
        mode = 'bank';

        /* PERF FIX 4 — pre-warm around t=0 so the first scroll after decode
         * lands on resident bitmaps instead of a cold cache. */
        focus.length = 0;
        noteFocus(0);
        for (let k = 0; k < PREWARM && k < frames.length; k++) request(k);
        return true;
      } catch (e) {
        const fatal = accel === 'prefer-software' || String(e && e.message) === 'watchdog';
        if (fatal) {
          clearTimeout(watchdog);
          building = false;
          if (!isStale()) revert();
          return false;
        }
        // fall through to the single software retry
      }
    }

    clearTimeout(watchdog);
    building = false;
    if (!isStale()) revert();
    return false;
  }

  function setDuration(d) {
    if (typeof d !== 'number' || !isFinite(d) || d <= 0) return;
    if (mode === 'bank') return;      // the bank's own duration wins
    dur = d;
    ready = true;
  }

  function destroy() {
    revert();
    ready = false;
    building = false;
    focus.length = 0;
  }

  return {
    build,
    setDuration,
    nearestIndex,
    acquire,
    acquireNearest,
    prefetch,
    fallback: revert,
    destroy,
    get mode() { return mode; },
    get ready() { return ready; },
    get dur() { return dur; },
    get count() { return frames ? frames.length : 0; },
  };
}
