/* PLATE® — scroll engine */

const WIPE_VH = 80;
const TITLE_Q = 0.25;
const ABOUT_IN = [0.18, 0.27];
const ABOUT_OUT = [0.333, 0.373];
const SEC2_RAMP = [0.44, 0.56];
const FLY = [0.565, 0.655];
const FLY_STEP = 0.20;
const FLY_DUR = 0.60;
const STAT_FROM = 0.74;
const STAT_IN = 0.34;
const STAT_HOLD = 0.40;
const SEC2_ENTER = [0.44, 0.49];
const SEC2_SHOW = [0.43, 0.77];
const S2_EMERGE = 0.84;
const PIN_FRAC = 0.66;
const BAND_HL = 130;
const BAND_TOP = 220;
const BAND_BOT = 160;
const LERP_TAU = 8;
const SNAP = 0.002;
const LRU_MAX = 24;
const LEAD = 24;
const WATCHDOG = 60000;
const FADE_A = [0.93, 0.98];
const WIPE_LEAD = 1;
const A = 1 / 3;
const B = 2 / 3;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const expoOut = (t) => 1 - Math.pow(2, -10 * t);
const easeIn = (t) => t * t;
const norm = (v, a, b) => clamp01((v - a) / (b - a));
const r3 = (v) => Math.round(v * 1000) / 1000;

const titleOut = A * TITLE_Q;
const titleIn = B + (1 - B) * (1 - TITLE_Q);

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- entrance */

let shown = false;
function showPage() {
  if (shown) return;
  shown = true;
  requestAnimationFrame(() => document.documentElement.classList.add('is-ready'));
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(showPage);
} else {
  showPage();
}
setTimeout(showPage, 2500);

/* -------------------------------------------------------------- frame bank */

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

function createClip(video, canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });

  const clip = {
    video,
    canvas,
    src: video.getAttribute('src'),
    bank: null,          // [{ts, blob}] sorted by ts
    dur: 0,
    ready: false,
    mode: 'video',       // 'video' | 'bank'
    visible: true,
    t: 0,
    target: 0,
    painted: false,
    cur: -1,
    lru: new Map(),
    pending: new Set(),
    token: 0,
  };

  video.addEventListener('loadedmetadata', () => {
    clip.dur = video.duration || 0;
    clip.ready = true;
    try { video.currentTime = 0.001; } catch (e) { /* ignore */ }
    video.pause();
  }, { once: true });

  clip.revert = function revert() {
    clip.mode = 'video';
    clip.bank = null;
    for (const bmp of clip.lru.values()) { try { bmp.close(); } catch (e) {} }
    clip.lru.clear();
    canvas.classList.remove('is-live');
    clip.painted = false;
  };

  clip.nearestIndex = function nearestIndex(t) {
    const bank = clip.bank;
    if (!bank || !bank.length) return -1;
    let lo = 0, hi = bank.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bank[mid].ts < t) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(bank[lo - 1].ts - t) <= Math.abs(bank[lo].ts - t)) lo--;
    return lo;
  };

  function want(i) {
    const bank = clip.bank;
    if (!bank || i < 0 || i >= bank.length) return null;
    const hit = clip.lru.get(i);
    if (hit) {
      clip.lru.delete(i);
      clip.lru.set(i, hit);
      return hit;
    }
    if (!clip.pending.has(i)) {
      clip.pending.add(i);
      const tok = clip.token;
      createImageBitmap(bank[i].blob).then((bmp) => {
        clip.pending.delete(i);
        if (tok !== clip.token || clip.mode !== 'bank') { try { bmp.close(); } catch (e) {} return; }
        clip.lru.set(i, bmp);
        while (clip.lru.size > LRU_MAX) {
          const oldest = clip.lru.keys().next().value;
          const dead = clip.lru.get(oldest);
          clip.lru.delete(oldest);
          if (dead !== bmp) { try { dead.close(); } catch (e) {} }
        }
      }).catch(() => { clip.pending.delete(i); });
    }
    return null;
  }

  clip.draw = function draw(t) {
    if (clip.mode === 'bank' && clip.bank && clip.bank.length) {
      const i = clip.nearestIndex(t);
      // warm a small window around the playhead
      for (let d = -1; d <= 2; d++) if (d !== 0) want(i + d);
      const bmp = want(i);
      if (bmp && i !== clip.cur) {
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        clip.cur = i;
        if (!clip.painted) {
          clip.painted = true;
          canvas.classList.add('is-live');
        }
      }
      return;
    }
    if (!clip.ready) return;
    if (Math.abs(video.currentTime - t) > 0.01) {
      try { video.currentTime = t; } catch (e) { /* ignore */ }
    }
  };

  clip.shareBank = function shareBank(other) {
    if (!other.bank || !other.bank.length) return;
    clip.bank = other.bank;
    clip.dur = other.dur || clip.dur;
    clip.ready = true;
    clip.mode = 'bank';
    clip.cur = -1;
  };

  clip.build = async function build() {
    if (REDUCED || typeof VideoDecoder === 'undefined' || typeof MP4Box === 'undefined') return false;

    const tok = ++clip.token;
    let watchdog;
    const guard = new Promise((_, rej) => { watchdog = setTimeout(() => rej(new Error('watchdog')), WATCHDOG); });

    // --- stage 1: fetch + demux. Failures here revert outright.
    let demux;
    try {
      demux = await Promise.race([fetchAndDemux(clip.src), guard]);
    } catch (e) {
      clearTimeout(watchdog);
      clip.revert();
      return false;
    }

    // --- stage 2: decode. One retry with software decoding on failure.
    for (const accel of ['no-preference', 'prefer-software']) {
      try {
        const bank = await Promise.race([decodeAll(demux, accel, canvas.width, canvas.height), guard]);
        clearTimeout(watchdog);
        if (tok !== clip.token) return false;           // a newer run superseded us
        if (!bank.length) { clip.revert(); return false; }
        bank.sort((a, b) => a.ts - b.ts);
        clip.bank = bank;
        clip.dur = demux.duration || clip.dur;
        clip.ready = true;
        clip.mode = 'bank';
        clip.cur = -1;
        return true;
      } catch (e) {
        if (accel === 'prefer-software' || String(e && e.message) === 'watchdog') {
          clearTimeout(watchdog);
          clip.revert();
          return false;
        }
        // fall through to the software retry
      }
    }
    clearTimeout(watchdog);
    clip.revert();
    return false;
  };

  return clip;
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

async function decodeAll(demux, hardwareAcceleration, cw, ch) {
  const off = document.createElement('canvas');
  off.width = cw;
  off.height = ch;
  const octx = off.getContext('2d', { alpha: false });

  const bank = [];
  let live = 0;
  let failed = null;
  const jobs = [];

  const decoder = new VideoDecoder({
    output: (frame) => {
      live++;
      const ts = frame.timestamp / 1e6;
      octx.drawImage(frame, 0, 0, cw, ch);
      frame.close();
      jobs.push(new Promise((res) => {
        off.toBlob((blob) => {
          live--;
          if (blob) bank.push({ ts, blob });
          res();
        }, 'image/webp', 0.82);
      }));
    },
    error: (e) => { failed = e; },
  });

  const cfg = {
    codec: demux.codec,
    codedWidth: demux.width,
    codedHeight: demux.height,
    hardwareAcceleration,
  };
  if (demux.description) cfg.description = demux.description;
  decoder.configure(cfg);

  const ts = demux.timescale;
  for (const s of demux.samples) {
    if (failed) break;
    while (live >= LEAD) await Promise.race(jobs.slice(-LEAD));
    decoder.decode(new EncodedVideoChunk({
      type: s.is_sync ? 'key' : 'delta',
      timestamp: (s.cts / ts) * 1e6,
      duration: (s.duration / ts) * 1e6,
      data: s.data,
    }));
  }

  if (failed) { try { decoder.close(); } catch (e) {} throw failed; }
  await decoder.flush();
  await Promise.all(jobs);
  try { decoder.close(); } catch (e) {}
  if (failed) throw failed;
  return bank;
}

/* ------------------------------------------------------------------ layout */

const stage = document.getElementById('stage');
const revA = document.getElementById('ra');
const revB = document.getElementById('rb');
const sec2 = document.getElementById('sec2');
const strip = document.getElementById('strip');
const titleEl = document.querySelector('.title');
const aboutEl = document.querySelector('.about');
const statEls = [...document.querySelectorAll('[data-stat]')];
const blocks = [...strip.querySelectorAll('[data-block]')];
const wTitle = strip.querySelector('.w-title');
const wList = strip.querySelector('.w-list');
const wDesc2 = strip.querySelector('.w-desc2');
const rowsL = [...strip.querySelectorAll('.w-col--l .w-row')];
const rowsR = [...strip.querySelectorAll('.w-col--r .w-row')];

const clips = [
  createClip(document.getElementById('v1'), document.getElementById('c1')),
  createClip(document.getElementById('v2'), document.getElementById('c2')),
  createClip(document.getElementById('v3'), document.getElementById('c3')),
];

let vw = innerWidth;
let vh = innerHeight;
let runwayPx = 1;
let wipe = 0.1;
let s2Start = 0;
let s2Pin = 0;

function measure() {
  vw = innerWidth;
  vh = innerHeight;
  runwayPx = Math.max(1, document.documentElement.scrollHeight - vh);

  // a wipe should take WIPE_VH of scrolling, expressed as a fraction of p —
  // capped so a short runway can never hand a single wipe a third of the page.
  wipe = Math.min(0.28, ((WIPE_VH / 100) * vh) / runwayPx);

  const titleTop = wTitle.offsetTop;
  const groupTop = Math.min(wList.offsetTop, wDesc2.offsetTop);
  const groupBottom = Math.max(
    wList.offsetTop + wList.offsetHeight,
    wDesc2.offsetTop + wDesc2.offsetHeight
  );
  const groupCenter = (groupTop + groupBottom) / 2;

  s2Pin = PIN_FRAC * vh - groupCenter;
  s2Start = S2_EMERGE * vh - titleTop;
}

/* ----------------------------------------------------------------- writers */

const last = {};
function setVar(el, name, value, key) {
  if (last[key] === value) return;
  last[key] = value;
  el.style.setProperty(name, value);
}

function updateTitle(p) {
  let e;
  if (p <= titleOut) e = r3(norm(p, 0, titleOut));
  else if (p >= titleIn) e = r3(1 - norm(p, titleIn, 1));
  else e = 1;
  setVar(titleEl, '--exit', e, 'title');
  titleEl.classList.toggle('is-exiting', e > 0);
  titleEl.classList.toggle('is-gone', e >= 1);
}

function updateStats(p) {
  const slot = (titleIn - STAT_FROM) / statEls.length;
  const exitLen = 1 - STAT_IN - STAT_HOLD;
  statEls.forEach((el, i) => {
    const a = STAT_FROM + i * slot;
    const u = (p - a) / slot;
    let e;
    if (u <= 0 || u >= 1) e = 1;
    else if (u < STAT_IN) e = 1 - norm(u, 0, STAT_IN);
    else if (u < STAT_IN + STAT_HOLD) e = 0;
    else e = norm(u, STAT_IN + STAT_HOLD, STAT_IN + STAT_HOLD + exitLen);
    e = r3(e);
    setVar(el, '--exit', e, 'stat' + i);
    el.classList.toggle('is-exiting', e > 0);
    el.classList.toggle('is-gone', e >= 1);
  });
}

function updateAbout(p) {
  let e;
  if (p < ABOUT_IN[0]) e = 0;
  else if (p < ABOUT_IN[1]) e = expoOut(norm(p, ABOUT_IN[0], ABOUT_IN[1]));
  else if (p < ABOUT_OUT[0]) e = 1;
  else if (p < ABOUT_OUT[1]) e = 1 - expoOut(norm(p, ABOUT_OUT[0], ABOUT_OUT[1]));
  else e = 0;
  e = r3(e);
  setVar(aboutEl, '--in', e, 'about');
  aboutEl.classList.toggle('is-anim', e > 0 && e < 1);
  aboutEl.classList.toggle('is-hidden', e <= 0);
}

function updateReveals(p) {
  const ra = clamp01((p - A) / wipe);
  const rb = clamp01((p - B) / wipe);
  setVar(revA, '--reveal', r3(ra), 'ra');
  setVar(revB, '--reveal', r3(rb), 'rb');

  const out = r3(norm(ra, FADE_A[0], FADE_A[1]));
  setVar(stage, '--stage-out', out, 'so');

  const stageCovered = ra >= 1;
  const revACovered = rb >= 1;
  stage.classList.toggle('is-covered', stageCovered);
  revA.classList.toggle('is-covered', revACovered);

  clips[0].visible = !stageCovered;
  clips[1].visible = ra > 0 && !revACovered;
  clips[2].visible = rb > 0;
}

function updateSec2(p) {
  const show = p >= SEC2_SHOW[0] && p <= SEC2_SHOW[1];
  sec2.classList.toggle('is-hidden', !show);
  if (!show) return;

  const s2y = REDUCED
    ? s2Pin
    : s2Start + (s2Pin - s2Start) * clamp01(norm(p, SEC2_RAMP[0], SEC2_RAMP[1]));
  setVar(strip, '--s2y', r3(s2y) + 'px', 's2y');

  const enter = expoOut(norm(p, SEC2_ENTER[0], SEC2_ENTER[1]));

  blocks.forEach((el, bi) => {
    const top = el.offsetTop + s2y;
    const bottom = top + el.offsetHeight;
    let o = Math.min(
      expoOut(clamp01((top - BAND_HL) / BAND_TOP)),
      expoOut(clamp01((vh - bottom) / BAND_BOT))
    );
    o = clamp01(o);
    if (el === wTitle) {
      o *= enter;
      const wb = (1 - o) * (1 - o) * 6;
      setVar(wTitle, '--wb', r3(wb) + 'px', 'wb');
      wTitle.classList.toggle('is-entering', o > 0 && o < 1);
    }
    setVar(el, '--o', r3(o), 'o' + bi);
  });

  const u = norm(p, FLY[0], FLY[1]);
  for (let i = 0; i < rowsL.length; i++) {
    const start = i * FLY_STEP;
    const f = REDUCED ? 0 : r3(easeIn(clamp01((u - start) / FLY_DUR)));
    // left and right leave together, in opposite directions
    [rowsL[i], rowsR[i]].forEach((el, side) => {
      if (!el) return;
      setVar(el, '--fly', f, 'fly' + i + side);
      el.classList.toggle('is-flying', f > 0 && f < 1);
    });
  }
}

function updateScrub(p, dt) {
  const dur = clips[0].dur || 0;
  if (!dur) return;
  const span = Math.max(0.001, dur - 2 * WIPE_LEAD);
  const k = 1 - Math.exp(-dt * LERP_TAU);
  clips.forEach((clip, i) => {
    const target = REDUCED ? 0 : Math.min(dur, p * span + i * WIPE_LEAD);
    clip.target = target;
    if (Math.abs(target - clip.t) < SNAP) clip.t = target;
    else clip.t += (target - clip.t) * k;
    if (clip.visible) clip.draw(clip.t);
  });
}

/* -------------------------------------------------------------------- loop */

function progress() {
  return clamp01(scrollY / runwayPx);
}

let lastT = 0;
function frame(now) {
  const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60;
  lastT = now;

  if (innerWidth !== vw || innerHeight !== vh) measure();

  const p = progress();
  updateTitle(p);
  updateStats(p);
  updateAbout(p);
  updateReveals(p);
  updateSec2(p);
  updateScrub(p, dt);

  requestAnimationFrame(frame);
}

let rt = 0;
function onResize() {
  clearTimeout(rt);
  rt = setTimeout(measure, 120);
}
addEventListener('resize', onResize);
addEventListener('orientationchange', onResize);
addEventListener('load', measure);

measure();
requestAnimationFrame(frame);

/* One continuous plate: build the bank once, share it with both reveals. */
if (!REDUCED) {
  clips[0].build().then((ok) => {
    if (!ok) return;
    clips[1].shareBank(clips[0]);
    clips[2].shareBank(clips[0]);
  });
}

/* -------------------------------------------------------------- diagnostic */

Object.defineProperty(window, '__plate', {
  value: Object.freeze({
    get clips() { return clips; },
    get map() {
      return { titleOut, titleIn, wipe, A, B, runwayPx, vw, vh };
    },
    get aboutIn() { return ABOUT_IN.slice(); },
    get stats() { return statEls; },
    get sec2() { return { s2Start, s2Pin, show: SEC2_SHOW.slice(), ramp: SEC2_RAMP.slice() }; },
    p() { return progress(); },
    drive(p) {
      p = clamp01(p);
      updateTitle(p);
      updateStats(p);
      updateAbout(p);
      updateReveals(p);
      updateSec2(p);
      updateScrub(p, 1);
      return p;
    },
    seek(i, t) {
      const c = clips[i];
      if (!c) return false;
      c.t = t;
      c.draw(t);
      return true;
    },
  }),
  writable: false,
  configurable: false,
});
