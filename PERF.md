# PERF.md — Independent scroll-performance audit

**Scope:** `legacy/main.js`, `legacy/style.css`, `legacy/index.html`
**Symptom under investigation:** "video scrolling has an issue, where it lags or stutters."
**Method:** static read of the three files only. No profiling was run. Every finding below states its confidence and the trace evidence that would confirm or kill it (see [How to measure](#how-to-measure)).

A note on framing before the list: the reported symptom has **two mechanically distinct causes** that feel similar to a user, and the fixes are disjoint. Separating them is the first thing to do:

- **Jank** — the main thread misses its rAF deadline, so *everything* (video, text, wipes) freezes together for a few frames. Findings F1, F2, F3, F7, F8.
- **Playhead stall** — the page keeps animating at 60fps but the canvas keeps showing the same video frame, so only the *video* looks stuck. Findings F4, F5, F11.

If the text/wipes stay smooth while the video hitches, stop reading at F4. If the whole page hitches together, F1–F3 are your targets.

---

## Ranked findings

| # | Finding | Location | Confidence | When it bites |
|---|---|---|---|---|
| F1 | Full decode pipeline (drawImage + WebP encode of every frame) runs on the main thread | `main.js:266-321` | High | First ~5-30s after load — exactly when the user first scrolls |
| F2 | Forced synchronous layout, up to 4× per frame, in `updateSec2` | `main.js:456-457` | High | p ∈ [0.43, 0.77], every frame |
| F3 | Reveals animate `width` every frame → layout + paint + clip-tree update on full-viewport composited stacks | `style.css:40`, `main.js:427-428` | High (layout), Medium (render-surface cost) | Whole page; worse for `reveal--a` (rotated) |
| F4 | Warm window is ±2 frames; a miss paints nothing and leaves a stale frame on screen | `main.js:145,152-162` | High | Fast flick-scroll, bank mode |
| F5 | Three independent 24-entry ImageBitmap LRUs off one shared bank ≈ 250 MB | `main.js:23,88,133-142` | High (arithmetic), Medium (that it's the bottleneck) | Low-VRAM / integrated GPU, any scroll |
| F6 | Six full-viewport layers alive at once; `<video>` elements never torn down after bank mode wins | `index.html:19,24,52`; `main.js:179-222` | High | Whole page, all hardware; worst on mobile |
| F7 | Every-frame `innerWidth`/`innerHeight` compare re-runs `measure()` on mobile URL-bar collapse | `main.js:510`, `353-372` | High (mobile), Low (desktop) | Mobile scroll, continuously |
| F8 | Per-frame `filter: blur()` over large text, several elements at once | `style.css:111,119,167,191` | Medium-High | p ∈ [0.18,0.38] and [0.565,0.655] |
| F9 | The mp4 is downloaded twice (video `preload` + `fetch`) | `index.html:19`, `main.js:251` | High | First load, over the network, during first scroll |
| F10 | Custom-property writes invalidate whole subtrees | `main.js:451,469`; `style.css:158,161` | Medium | p ∈ [0.43,0.77] |
| F11 | `LERP_TAU = 8` puts a 125 ms constant lag between scroll and image | `main.js:21,489` | High (that it exists), High (that it reads as "lag") | Always |
| F12 | Video-fallback mode issues `currentTime` writes to 2 videos per frame | `main.js:165-167` | Medium (severity is lower than it looks) | Fallback mode only |
| F13 | `decodeAll` backpressure allocates and re-subscribes 24 promises per iteration | `main.js:306` | Medium (real, but dwarfed by F1) | Decode phase |
| F14 | `sec2` keeps animating while fully occluded by `reveal--b` | `main.js:444`; `style.css:46,152` | Medium | p ∈ [~0.67, 0.77] |

---

### F1 — The entire decode pipeline runs on the main thread

`main.js:266-321`

**Mechanism.** `decodeAll` creates a *plain* `<canvas>` via `document.createElement('canvas')` (`main.js:267`) and a 2D context on the main thread. `VideoDecoder`'s `output` callback (`main.js:279-290`) is dispatched as a main-thread task, and inside it, per decoded frame:

- `octx.drawImage(frame, 0, 0, cw, ch)` — `main.js:281` — a 1280×720 VideoFrame → 2D canvas draw, main thread.
- `off.toBlob(..., 'image/webp', 0.82)` — `main.js:284-288` — a full WebP **encode** of 1280×720. Chromium's `toBlob` does the encode off-thread, but the pixel readback that feeds it is a main-thread GPU→CPU sync point on an accelerated canvas.

A 13-second clip at 30 fps is ~390 frames; at 60 fps, ~780. Every one of those pays the above. Nothing yields to `requestIdleCallback`, `scheduler.yield()`, or a Worker. The `await` at `main.js:306` yields only to the *microtask* queue, which does let the decoder's output tasks run — but it does **not** give the rAF loop priority. The whole bank build competes head-on with `frame()`.

**Why it matters here specifically:** this work starts at `main.js:537`, i.e. immediately at load, which is precisely the window in which the user first scrolls. The symptom is "the page stutters when I start scrolling, then settles."

**Severity.** High, transient. Universal on low-end hardware; on a fast desktop it may only cost the first 3-5 seconds. Note the failure path makes it *worse*: `main.js:197` retries the entire decode with `prefer-software`, doubling the work on exactly the machines least able to absorb it.

**Fix.** Move demux + decode + encode into a Worker with `OffscreenCanvas`:

```js
// worker.js
const off = new OffscreenCanvas(cw, ch);
const octx = off.getContext('2d', { alpha: false });
// ... same decoder, but:
const blob = await off.convertToBlob({ type: 'image/webp', quality: 0.82 });
// post {ts, blob} back; blobs are cheap to transfer
```

The `VideoDecoder`, `MP4Box`, and `fetch` all work in a Worker. The main thread receives only `{ts, blob}` records.

If a Worker is too large a change, the minimum viable mitigation is to gate the pump on scroll idleness — but that just moves the stall rather than removing it, so prefer the Worker.

**Risk.** MP4Box needs `importScripts`/an ESM build inside the Worker. `OffscreenCanvas.convertToBlob` is well supported wherever `VideoDecoder` is, so the capability check at `main.js:180` already covers it. Transferring ~390 Blobs is fine (Blobs are handle-passed, not copied).

---

### F2 — Forced synchronous layout, up to 4× per frame, in `updateSec2`

`main.js:443-483`

**Mechanism.** The write/read interleave inside one rAF callback:

```js
setVar(strip, '--s2y', r3(s2y) + 'px', 's2y');   // main.js:451  — WRITE (dirties style/layout)
blocks.forEach((el, bi) => {
  const top    = el.offsetTop;                    // main.js:456  — READ  → forces style+layout flush
  const bottom = top + el.offsetHeight;           // main.js:457  — READ
  ...
  setVar(wTitle, '--wb', ...);                    // main.js:466  — WRITE (re-dirties)
  setVar(el, '--o', r3(o), 'o' + bi);             // main.js:469  — WRITE (re-dirties)
});
```

Each loop iteration writes a custom property, and the *next* iteration's `offsetTop` read forces a fresh **Recalculate Style + Layout** of the document. With 4 `[data-block]` elements (`index.html:30,34,35,47`) that is up to **4 forced reflows per frame**, on top of the frame's own natural layout.

These flushes are not cheap-and-scoped, because F3 has already dirtied the fixed-position reveal boxes in the same frame (`updateReveals` runs at `main.js:515`, immediately before `updateSec2` at `main.js:517`). The forced flush must resolve those too.

**The reads are entirely unnecessary.** All four blocks are absolutely positioned at `vw`-derived offsets (`style.css:163,172,178,196`) inside `.strip`, which is `position:absolute; top:0; left:0` (`style.css:157`). Their `offsetTop`/`offsetHeight` are invariant with respect to scroll and to `--s2y` — they change *only* on resize. The `+ s2y` at `main.js:456` is added in JS, not read from layout, which confirms the author already knew this.

**Severity.** High, persistent across a third of the scroll runway. This is the single most likely cause of *steady* main-thread jank.

**Fix.** Cache the metrics in `measure()` and drop the reads:

```js
// in measure(), main.js:353
let blockBox = [];
blockBox = blocks.map((el) => ({ top: el.offsetTop, h: el.offsetHeight }));

// in updateSec2, replacing main.js:455-457
blocks.forEach((el, bi) => {
  const top = blockBox[bi].top + s2y;
  const bottom = top + blockBox[bi].h;
  ...
});
```

**Risk.** Low. The only hazard is stale metrics if the blocks reflow without a resize — e.g. web fonts landing after `measure()` ran, changing the wrapped height of `.w-desc1`/`.w-desc2`. Guard it by also calling `measure()` from the existing `document.fonts.ready` handler (`main.js:51`), which currently only calls `showPage`.

---

### F3 — Reveals animate `width` every frame

`style.css:37-50`, driven from `main.js:427-428`

```css
.reveal{
  --rot: calc(var(--reveal,0)*var(--angle));
  position:fixed; top:50%; left:50%;
  width: calc(var(--reveal,0)*var(--span-w));   /* style.css:40 — animated per frame */
  height: var(--span-h);
  transform: translate(-50%,-50%) rotate(var(--rot));
  overflow:hidden;
}
.reveal video,.reveal canvas{
  position:absolute; top:50%; left:50%; width:100vw; height:100vh; object-fit:cover;
  transform: translate(-50%,-50%) rotate(calc(var(--rot)*-1));   /* style.css:49 */
}
```

**Mechanism, staged:**

1. **Layout.** `width` is a layout-inducing property. The box is `position:fixed`, so the dirty subtree is small — the reveal plus its two children, whose `top/left:50%` resolve against the changing box. But it is layout *every frame*, and combined with F2 it is layout *synchronously, four times* every frame.
2. **Paint / clip tree.** The `overflow:hidden` box is a clip node whose bounds change every frame, so the clip must be re-pushed to the compositor each frame — a per-frame **Update Layer Tree**.
3. **Composite (the part I'm least sure of, and most suspicious of).** `reveal--a` has `--angle:-45deg` (`style.css:45`), so its clip rect is **not axis-aligned** in screen space, while its child `<canvas>` carries a counter-rotation (`style.css:49`) that brings the content back to axis-aligned. A composited child under a non-axis-aligned ancestor clip generally cannot be handled by a simple scissor rect: Chromium falls back to a **render surface** (offscreen render target) plus a mask. `--span-w/--span-h` is `calc(72vw + 72vh)` — on a 1440×900 viewport that's a **1685×1685 px offscreen surface, allocated and composited every frame**.

   `reveal--b` has `--angle:0deg` (`style.css:46`), so its clip *is* axis-aligned and this concern does **not** apply to it. That asymmetry is itself a diagnostic: if stutter is markedly worse across p ∈ [0.333, 0.333+wipe] (the `reveal--a` wipe) than across p ∈ [0.667, 0.667+wipe] (the `reveal--b` wipe), stage 3 is real.

**Severity.** High for stages 1-2 (confident). Potentially dominant for stage 3 (speculative — verify before acting).

**Fix.** Keep the box at full span always; do the reveal with `clip-path`, which skips layout entirely and leaves the child's counter-rotation static:

```css
.reveal{
  position:fixed; top:50%; left:50%;
  width: var(--span-w);            /* constant */
  height: var(--span-h);
  transform: translate(-50%,-50%) rotate(var(--angle));   /* constant — no --rot */
  clip-path: inset(0 calc((1 - var(--reveal,0)) * 50%));  /* animated */
  overflow:hidden;
}
.reveal video,.reveal canvas{
  transform: translate(-50%,-50%) rotate(calc(var(--angle) * -1));  /* now static */
}
```

Two extra wins fall out: the child's transform stops changing every frame (currently it does, via `--rot`), and `--rot` disappears entirely.

**Risk.** Geometry must be re-verified — the current `rotate(var(--reveal)*var(--angle))` means the box also *rotates in* as it widens, which the sketch above drops in favour of a constant angle. That is a visual change, not just a perf change. If the rotate-in is intentional, keep `--rot` on the transform and only move the `width` animation to `clip-path`. Also note that a per-frame `clip-path` value change is still a main-thread style write; it is not compositor-animated. The win is eliminating layout, not eliminating main-thread work.

**Better long-term fix.** The three layers exist to composite one image through two rotated windows. That is four lines of Canvas2D:

```js
ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
ctx.beginPath(); ctx.rect(-w/2, -h/2, w, h); ctx.clip();
ctx.rotate(-angle); ctx.translate(-cx, -cy);
ctx.drawImage(bmp, 0, 0, W, H);
ctx.restore();
```

One canvas, one layer, one texture upload per frame, zero layout, zero clip-tree churn. This collapses F3, F5, F6, and F10 simultaneously. It is the highest-leverage change in this document and also the largest.

---

### F4 — Warm window of ±2 frames; a miss paints nothing

`main.js:121-168`

```js
for (let d = -1; d <= 2; d++) if (d !== 0) want(i + d);   // main.js:152 — prefetch ±2
const bmp = want(i);                                      // main.js:153
if (bmp && i !== clip.cur) { ctx.drawImage(...); }         // main.js:154 — on miss: paint nothing
```

`want` (`main.js:121-146`) is a synchronous cache read. On a miss it fires `createImageBitmap` and returns `null`. `clip.draw` then returns having drawn nothing — **the canvas retains the previous frame**.

**Why the window is too small.** `clip.t` is an exponential follower of `clip.target` (`main.js:489-494`) with `k = 1 - exp(-dt·8) ≈ 0.125` per 60 Hz frame. On a flick, `target` can jump most of the runway; the first follower step then advances `clip.t` by ~12.5 % of that gap. For a `span` of ~11 s, a 0.3-of-page flick moves `target` by 3.3 s, so `clip.t` advances ~0.41 s in one frame — **~12 video frames at 30 fps**. A ±2 window is off by an order of magnitude, guaranteed miss, guaranteed stale paint. The follower keeps stepping, so the misses continue for many consecutive frames.

This is the mechanism that produces "the video freezes then snaps," which is the most literal reading of the reported symptom.

**Two secondary bugs in the same eight lines:**

- **Prefetch order is inverted.** `main.js:152` issues `want(i-1)`, `want(i+1)`, `want(i+2)` *before* `want(i)` at line 153. The frame you need right now is queued behind three you don't. Under `createImageBitmap` contention that directly adds latency to the visible frame.
- **The window is direction-agnostic.** `-1..+2` prefetches backwards even during a fast forward scroll, wasting a quarter of the decode budget.

**Severity.** High on fast flick-scroll in bank mode; near-zero on slow drag (where ±2 is adequate). Worse on low-end hardware, where `createImageBitmap` latency is higher.

**Fix.** Request the needed frame first, size and orient the window by velocity, and never leave a stale frame — fall back to the nearest cached index:

```js
clip.draw = function draw(t) {
  if (clip.mode === 'bank' && clip.bank && clip.bank.length) {
    const i = clip.nearestIndex(t);
    let bmp = want(i);                                   // needed frame FIRST

    // prefetch toward where the playhead is actually heading
    const iT = clip.nearestIndex(clip.target);
    const dir = Math.sign(iT - i) || 1;
    const reach = Math.min(12, Math.abs(iT - i) + 2);
    for (let d = 1; d <= reach; d++) want(i + d * dir);
    want(i - dir);                                        // one frame of hysteresis

    // never leave a stale frame: settle for the closest thing we have
    if (!bmp) {
      let best = -1;
      for (const k of clip.lru.keys())
        if (best < 0 || Math.abs(k - i) < Math.abs(best - i)) best = k;
      if (best >= 0 && best !== clip.cur) bmp = clip.lru.get(best), (i = best);
    }
    if (bmp && i !== clip.cur) { ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height); clip.cur = i; ... }
    return;
  }
  ...
};
```

**Risk.** A wide prefetch window can *worsen* things by saturating `createImageBitmap` and thrashing the LRU — cap `reach` (12 above) and fix F5 at the same time, or you trade a stall for a memory stampede. The nearest-cached fallback also changes semantics: the canvas may now show a frame up to N frames off rather than freezing. That is almost always the better artifact, but it is a visual change.

---

### F5 — Three independent LRUs; ~250 MB of ImageBitmaps

`main.js:23,88,133-142,170-177`

`shareBank` (`main.js:170`) correctly shares the **blob array** across all three clips — the decode in F1 happens once, not three times. Good. But each clip keeps its **own** `lru` (`main.js:88`) and its own `pending`, so the decoded `ImageBitmap`s are not shared at all.

The arithmetic: `1280 × 720 × 4 B = 3.5 MiB` per bitmap. `LRU_MAX = 24` (`main.js:23`) × 3 clips = **72 live bitmaps ≈ 253 MiB**. On an integrated GPU or a phone, that is enough to trigger texture eviction, and eviction shows up as exactly the reported symptom: a re-upload stall on the next `drawImage`.

Compounding it: **20 of those 24 slots per clip are dead weight.** The warm window (F4) only ever touches 4 indices, so the LRU holds 20 frames that will never be requested again before they age out. The cache is 6× larger than the access pattern justifies.

**Severity.** High on low-VRAM hardware; possibly invisible on a discrete GPU. Confident in the arithmetic, less confident that it is the bottleneck on the reporter's machine.

**Fix, in order of effort.** (a) Drop `LRU_MAX` to ~8 immediately — one line, no downside given the current window. (b) If you widen the window per F4, hoist the cache to be shared across all three clips, keyed by bank index, with refcounts so one clip's eviction doesn't close a bitmap another is still drawing. (c) The F3 single-canvas rewrite removes the problem entirely, since there is then one consumer.

**Risk.** Refcounting is the sharp edge — `bmp.close()` on a bitmap another clip is mid-`drawImage` on will throw or paint garbage. Note the existing code already has this hazard in miniature at `main.js:141` (`if (dead !== bmp)`), which guards only the self-eviction case.

---

### F6 — Six full-viewport layers; the `<video>` elements are never torn down

`index.html:19-20, 24-25, 52-53`; `main.js:179-222`

Each of the three layers carries **both** a `<video>` and a `<canvas>`, each stretched to the full viewport (`style.css:32-34, 47-50`). When the bank build succeeds, `clip.mode` flips to `'bank'` (`main.js:207`) and the canvas fades in over the video (`style.css:52-53`) — but the `<video>` is never removed, hidden, or `display:none`'d. It stays in the tree as a live, full-viewport media element with its own compositing layer and its own decoder attachment.

That is **six full-viewport composited layers** for a page that displays one image. `revert()` (`main.js:100-107`) tears down the *canvas* path but there is no corresponding "bank won, retire the video" path.

Occlusion helps partially but not fully: `.is-covered{visibility:hidden}` (`style.css:54`) is applied to `stage` and `revA` (`main.js:435-436`), but never to `revB` — and even when covered, the *video* inside a visible layer is still composited beneath its opaque canvas, since a `<canvas>` layer over a `<video>` layer is not a reliable occlusion cull in Chromium.

**Severity.** High on mobile and integrated-GPU laptops, where compositor bandwidth and media-element count are both constrained. Moderate on desktop.

**Fix.** Retire the videos once the bank is live:

```js
// after main.js:539-540, once shareBank has run for both reveals
for (const c of clips) {
  if (c.mode !== 'bank') continue;
  c.video.removeAttribute('src');
  c.video.load();          // detach the decoder
  c.video.remove();        // drop the layer
}
```

**Risk.** This forecloses the fallback. If you ever want to revert to video scrubbing after a bank failure, keep the element but `display:none` it instead — that removes the layer while preserving the element. Also make sure this runs only after `canvas.classList.add('is-live')` has actually fired (`main.js:159`), or you will show black during the 240 ms fade at `style.css:52`.

---

### F7 — Every-frame viewport compare re-runs `measure()` on mobile

`main.js:510`, `main.js:353-372`

```js
if (innerWidth !== vw || innerHeight !== vh) measure();   // main.js:510
```

On desktop this is harmless and effectively never fires. On **mobile it fires continuously during scroll**, because `innerHeight` tracks the collapsing/expanding URL bar. Each firing runs `measure()`, which:

- reads `document.documentElement.scrollHeight` (`main.js:356`) — a forced layout of the **whole document**, the most expensive read on the page;
- reads `offsetTop`/`offsetHeight` on three elements (`main.js:362-367`);
- **recomputes `wipe`** (`main.js:360`) and `s2Pin`/`s2Start` (`main.js:370-371`), which shifts the timing of every animation mid-scroll — a visible jump, not just a cost.

There is already a debounced `onResize` (`main.js:524-527`) doing the same job properly. Line 510 bypasses it.

Note the CSS uses `vh` units throughout (`style.css:46,48`), and `vh` resolves against the *large* viewport, which does **not** change during URL-bar collapse. So the CSS geometry is stable while the JS geometry is not — they actively disagree during the collapse.

**Severity.** High on mobile, negligible on desktop. Given the reporter did not specify a device, this is worth ruling in or out early — it is a two-line fix.

**Fix.** Only react to width, and let the debounced handler own the rest:

```js
if (innerWidth !== vw) measure();
```

If the height genuinely must be tracked, use `visualViewport`'s stable metrics or accept the large-viewport height, matching what CSS already does.

**Risk.** A genuine height-only change (desktop window resize with the width held constant, device rotation on a square-ish tablet) is now handled only by the 120 ms debounce at `main.js:526` — a brief period of wrong geometry. Acceptable; `orientationchange` is already wired at `main.js:529`.

---

### F8 — Per-frame `filter: blur()` over large text

`style.css:111, 119, 167, 191`

Four blurs are driven from per-frame custom properties:

| Selector | Radius | Target | Active window |
|---|---|---|---|
| `.exit-3d.is-exiting` (`style.css:111`) | up to 8px | `.title__mark` at `font-size:13.6vw`, `white-space:nowrap` — a ~185px-tall, viewport-wide glyph run | p < 0.083 and p > 0.75 |
| `.rise.is-anim` (`style.css:119`) | up to 5px | `.about`, ~46vw wide | p ∈ [0.18,0.27] ∪ [0.333,0.373] |
| `.w-title.is-entering` (`style.css:167`) | up to 6px | `.w-mark` | p ∈ [0.44,0.49] |
| `.w-row.is-flying` (`style.css:191`) | up to 12px | **six rows simultaneously** | p ∈ [0.565,0.655] |

The `.w-row` case is the worst and the most confidently diagnosed. Those rows carry only a 2D `transform: translateX(...)` (`style.css:188`), which does **not** promote them to their own layer. They therefore blur *into* their parent `.strip` — which does have `will-change:transform` (`style.css:159`) and so is a real layer. Result: during that 90 ms of scroll runway, six blurred text rows force a **repaint of the entire strip layer every frame**, with a 12 px blur kernel.

The `.exit-3d` case is better off: `.chrome` sets `perspective:1200px` (`style.css:59`) and `.exit-3d` uses `translate3d(0,0,Zpx)` (`style.css:108`), so those elements are promoted and the blur can be applied as a compositor filter without re-raster. That one I would deprioritise.

**Severity.** Medium-High, sharply localised to specific scroll bands. Highly diagnostic: if stutter reproduces reliably at p ≈ 0.6 and nowhere else, this is it.

**Fix.** Promote the blurred elements so the blur is a compositor filter over a stable raster, rather than a repaint of the parent:

```css
.w-row.is-flying { filter: blur(calc(var(--fly)*var(--fly)*var(--fly-blur,12px))); will-change: filter, transform; }
```

Add `will-change` via the `.is-flying` class only (the code already toggles it at `main.js:480`), so you are not holding six permanent layers. If that is still too costly, cheaper substitutes in descending fidelity: quantise the blur radius to 1px steps so the raster is reused across frames; drop the blur below some `--fly` threshold; or replace it with opacity alone (a compositor-only property).

**Risk.** `will-change` on six elements adds six layers for the duration of the window — this trades raster cost for compositor memory and can backfire on mobile. Measure both. The `@media (prefers-reduced-motion)` block at `style.css:227-245` already zeroes all four blurs, so that path is unaffected either way.

---

### F9 — The mp4 is fetched twice

`index.html:19, 24, 52`; `main.js:251`

All three `<video>` elements point at the same URL. `v1` carries `preload="auto"` (`index.html:19`), so the browser begins downloading the **entire** file at parse time. Independently, `fetchAndDemux` calls `fetch(clip.src)` (`main.js:251`) and pulls the whole file into an `ArrayBuffer`.

Whether these coalesce depends entirely on the response's cache headers from `r2.motionsites.dev`. If the response is not cacheable, or if the `fetch` starts before the media request has populated the HTTP cache, **the file is downloaded twice**, halving effective bandwidth during the exact window when the user is first scrolling.

**Severity.** High for first-load smoothness on constrained networks; zero on repeat visits with a warm cache.

**Fix.** Set `preload="none"` on all three videos, and if the fallback path is ever needed, feed it from the buffer you already have:

```js
// in fetchAndDemux, after the arrayBuffer resolves (main.js:254)
const url = URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
for (const c of clips) c.video.src = url;   // one network fetch total
```

**Risk.** With `preload="none"`, if WebCodecs is unavailable (`main.js:180` bails on `REDUCED` or missing `VideoDecoder`) *and* the blob-URL path above is not wired, the fallback has nothing to scrub and the page shows black. Wire both halves together or not at all. Also note this path means the fallback's first seek is preceded by a full-file download — worse worst-case latency, better common-case.

---

### F10 — Custom-property writes invalidate subtrees

`main.js:451, 469`; `style.css:158-161`

Custom properties inherit. Writing `--s2y` to `#strip` (`main.js:451`) marks `.strip`'s entire subtree — ~30 elements (`index.html:29-48`) — as needing style recalculation. Writing `--o` to each block (`main.js:469`) does the same for that block's subtree; `.w-list` alone holds 6 rows × 3 spans = 24 descendants.

Both properties are consumed exactly one level up from where they're written:

```css
.strip { transform: translateY(var(--s2y,0)); }   /* style.css:158 */
.strip > * { opacity: var(--o,0); }               /* style.css:161 */
```

so the inheritance is doing no work; it is pure invalidation surface.

**Confidence: Medium — verify before acting.** Blink has shipped optimisations that narrow custom-property invalidation to elements that actually reference the variable, and how much survives depends on the Chromium version. The trace tells you directly: check the element count on `Recalculate Style` (see [How to measure](#how-to-measure)). If it's ~5, this is a non-issue; if it's ~30-50, it's real.

**Fix.** Write the resolved properties directly and skip the variable machinery:

```js
strip.style.transform = 'translateY(' + r3(s2y) + 'px)';   // replaces main.js:451
el.style.opacity = r3(o);                                   // replaces main.js:469
```

Both are still main-thread style writes, but they touch exactly one element each. Keep the `setVar` memo-guard pattern (`main.js:377-381`) around them so unchanged values still short-circuit.

**Risk.** Low, but the CSS at `style.css:158,161` must be deleted in the same change, or the inline `transform`/`opacity` and the stylesheet's `var()`-based ones will fight. `style.css:161` is a `>` combinator applying to all children, so removing it changes what happens to any child not in `blocks` — currently there are none, but it is a latent trap.

---

### F11 — `LERP_TAU = 8` is a built-in 125 ms lag

`main.js:21, 489, 493-494`

```js
const k = 1 - Math.exp(-dt * LERP_TAU);   // main.js:489
clip.t += (target - clip.t) * k;          // main.js:494
```

Time constant = 1/8 s = **125 ms**. The image is always ~125 ms behind the scroll position, and after a fast flick it takes ~375 ms (3τ) to converge to within 5 %.

This is a deliberate design choice, not a bug — but the user's word was "lags," and a scroll-driven scrubber that trails the finger by an eighth of a second reads as lag even at a perfect 60 fps. It is also the direct cause of the F4 miss cascade: the follower is what generates the large per-frame index jumps that overrun the ±2 window.

**Severity.** High on perceived quality, zero on frame budget. Worth changing regardless of what the profiler says.

**Fix.** Raise `LERP_TAU` to 15-25 (τ = 40-67 ms), or make it velocity-adaptive so slow drags stay smoothed while flicks track directly:

```js
const gap = Math.abs(target - clip.t);
const tau = LERP_TAU + Math.min(24, gap * 12);   // converge harder on big jumps
const k = 1 - Math.exp(-dt * tau);
```

**Risk.** The smoothing exists to hide quantisation between scroll deltas and the 30 fps frame grid. Removing it may surface visible frame-stepping on slow drags — which is exactly what the velocity-adaptive form above preserves. Tune by eye.

---

### F12 — `currentTime` writes to two videos per frame in fallback mode

`main.js:164-167`

```js
if (Math.abs(video.currentTime - t) > 0.01) {
  try { video.currentTime = t; } catch (e) {}
}
```

Called from `updateScrub` (`main.js:495`) for every clip with `clip.visible`. The visibility gating at `main.js:438-440` means at most **two** clips are visible simultaneously (`clips[0].visible` goes false once `ra >= 1`), not three.

**This is less severe than it looks, and I want to flag that explicitly.** Chromium does not queue seeks: assigning `currentTime` while a seek is in flight replaces the *pending* seek rather than enqueueing a new one. The loop therefore self-throttles to the decoder's actual seek rate. The symptom is the video **trailing** the scroll, not main-thread jank.

Two things do make it worse than a single-video scrubber: two independent seek pipelines on the same 720p source competing for decoder capacity, and no keyframe awareness — a backward seek across a GOP boundary forces a full re-decode from the previous keyframe.

**Severity.** Medium, and **only in fallback mode**. Establish which mode you are actually in before spending time here — check `__plate.clips[0].mode` in the console (`main.js:549`). If it reads `'bank'`, this finding is inert.

**Fix.** Rate-limit to one seek per video in flight, and prefer `fastSeek`:

```js
if (!clip.seeking && Math.abs(video.currentTime - t) > 0.02) {
  clip.seeking = true;
  video.addEventListener('seeked', () => { clip.seeking = false; }, { once: true });
  if (video.fastSeek) video.fastSeek(t); else video.currentTime = t;
}
```

**Risk.** `fastSeek` snaps to the nearest keyframe, so precision drops to the GOP interval — for a 13 s clip that could be a second or more of error. Acceptable for a wipe-obscured fallback; not acceptable for the primary path. The `seeking` latch can also deadlock if `seeked` never fires (error, stalled network); add a timeout.

---

### F13 — `decodeAll` backpressure allocates per iteration

`main.js:306`

```js
while (live >= LEAD) await Promise.race(jobs.slice(-LEAD));
```

Three issues, all real, all small next to F1:

1. `jobs.slice(-LEAD)` allocates a fresh 24-element array **on every iteration of the `while`**, and `Promise.race` attaches a new pair of reaction handlers to all 24 promises each time. Over ~390 samples with backpressure engaged, that is tens of thousands of handler registrations.
2. `jobs` (`main.js:276`) grows without bound and is never trimmed — ~390 settled promises retained until `Promise.all(jobs)` at `main.js:317`. Small, but pointless.
3. Racing the **last** 24 jobs is the wrong end. Those are the *newest* and least likely to settle first; the oldest outstanding job is the one that will free a slot. It still functions (any settlement wakes the race), but it is backwards.

**Fix.** Replace the array-slicing race with a single reusable "a slot freed" promise:

```js
let waiter = null, wake = null;
// in the toBlob callback, after live--:
if (wake) { wake(); waiter = null; wake = null; }

// in the sample loop:
while (live >= LEAD) {
  waiter = waiter || new Promise((res) => { wake = res; });
  await waiter;
}
```

**Risk.** Low. Make sure `wake` is cleared before resolving, or a late `toBlob` callback resolves a stale waiter and lets the loop overrun `LEAD`. Fixing this alone will not move the needle — do it as part of the F1 Worker migration, not instead of it.

---

### F14 — `sec2` animates while fully occluded

`main.js:444`; `style.css:46, 152`

`SEC2_SHOW` runs to **0.77** (`main.js:15`), but `reveal--b` (z-index 7, `style.css:46`) fully covers the viewport once `rb >= 1`, i.e. from p = B + wipe = 0.667 + wipe. `.sec2` is z-index 6 (`style.css:152`) — underneath it. So for roughly p ∈ [0.67 + wipe, 0.77], `updateSec2` runs its full body — forced layouts (F2), custom-property writes (F10), 6 fly-row updates — against content that is completely invisible.

**Severity.** Medium. It is a pure waste band, and it overlaps the `reveal--b` wipe, where compositor load is already at its peak.

**Fix.** Extend the early-out at `main.js:444` to include occlusion:

```js
const show = p >= SEC2_SHOW[0] && p <= SEC2_SHOW[1] && !revBCovers;
```

where `revBCovers` is set in `updateReveals` (which already computes `rb >= 1` as `revACovered` at `main.js:434`). `updateReveals` runs before `updateSec2` in `frame()` (`main.js:515,517`), so the ordering is already correct.

**Risk.** Effectively none — it is invisible content by construction. Just double-check the z-order assumption holds at all viewport aspect ratios: `reveal--b` is `102vw × 102vh` with `--angle:0deg`, so it does fully cover. It does.

---

## Non-issues — things a reviewer will flag that are not the problem

Documented so nobody spends a day on them.

**`classList.toggle(name, force)` called unconditionally every frame** — `main.js:389-390, 406-407, 420-421, 435-436, 445, 467, 480`. Looks like dozens of DOM writes per frame. It isn't. `toggle` with an explicit force flag routes to `add`/`remove`, which compute the resulting token set and hand it to `setAttribute`; `Element::setAttribute` compares against the existing value and returns without invalidating when unchanged. These are cheap no-ops in the steady state. **Not worth touching.**

**`setVar`'s memo cache (`main.js:376-381`)** — correct, and doing real work. All keys are unique across the writers I checked (`'ra'`, `'rb'`, `'so'`, `'title'`, `'stat'+i`, `'about'`, `'s2y'`, `'wb'`, `'o'+bi`, `'fly'+i+side`), and with ≤3 rows there is no `'fly'` key collision. The one nit: `last` is global rather than per-element, so it would break if two different elements ever shared a key. They don't. **Correct as written.**

**Reading `window.scrollY` (`main.js:502`) and `innerWidth`/`innerHeight` (`main.js:510`) every frame** — these are layout-forcing reads per the standard reference, and a reviewer will flag them as reflow triggers. In practice they are **harmless here because of where they sit**: both run at the top of `frame()`, before any writes, when layout is already clean from the previous commit. The flush is a no-op. Contrast with F2, where identical-looking reads sit *after* writes and are genuinely expensive. The lesson is that the position matters, not the API. (The `innerHeight` read is still a problem on mobile — but for the reason in F7, not because it forces layout.)

**`[rowsL[i], rowsR[i]].forEach(...)` allocating per row per frame (`main.js:477`)** — 3 two-element arrays and 3 closures per frame. Real garbage, but it is nursery-allocated and collected in a scavenge you will never see in the trace. **Ignore.**

**`SNAP = 0.002` (`main.js:22, 493`)** — 2 ms, far finer than a 33 ms video frame, so the follower spends extra frames converging inside a single frame's worth of time. Zero cost: `nearestIndex` maps them all to the same index and the `i !== clip.cur` guard at `main.js:154` suppresses the redraw. **Working as intended.**

**`clip.build()` being called three times** — it isn't. Only `clips[0].build()` runs (`main.js:537`); the other two get the bank via `shareBank` (`main.js:539-540`). The expensive decode happens once. The *bitmaps* are triplicated (F5), but the decode is not.

**`canvas.plate { transition: opacity 240ms }` (`style.css:52`)** — fires exactly once per canvas, on the first successful paint (`main.js:157-160`). Not a per-frame cost.

**Google Fonts as a render-blocking third-party stylesheet (`index.html:11`)** — a genuine load-performance issue and worth fixing eventually, but it cannot cause mid-scroll stutter. Out of scope for this symptom. Note that `showPage` gates the entrance on `document.fonts.ready` with a 2500 ms backstop (`main.js:50-55`), so the failure mode is a delayed reveal, not jank.

---

## How to measure

Record in Chrome DevTools → Performance, with **CPU throttling 4×** and **Screenshots on**. Take three separate traces; they answer different questions.

### Trace A — first 15 seconds, scrolling from the top
Targets F1, F9.

- Filter the main thread for `VideoDecoder` output tasks and `toBlob`. If you see a dense band of main-thread tasks that vanishes once the bank finishes, **F1 is confirmed** — and it will be the dominant cause of early stutter.
- Long tasks (>50 ms, red-flagged) attributable to `drawImage`/canvas encode during this window: same conclusion.
- Network panel: look for **two** requests to the `.mp4`. If both show a full transfer size rather than `(disk cache)`, **F9 is confirmed**.
- In the console, `window.__plate.clips[0].mode` (`main.js:549`) tells you which mode you ended in. **Do this first** — it decides whether F4/F5 or F12 is even in scope.

### Trace B — steady slow drag across p ∈ [0.45, 0.70]
Targets F2, F3, F8, F10, F14.

- **Forced reflow.** Expand any long frame and look for `Layout` entries nested *inside* the rAF `Function Call`, marked with the purple warning triangle and "Forced reflow is a likely performance bottleneck." Up to **4 per frame** ⇒ **F2 confirmed**. This is the single most decisive marker in the whole audit; check it first.
- **Recalculate Style element count.** Hover the `Recalculate Style` entry — it reports how many elements were affected. ~5 ⇒ F10 is a non-issue on this Chromium build. ~30-50 ⇒ **F10 confirmed**, act on it.
- **Layout on every frame at all.** `Layout` appearing in frames where nothing structural changed ⇒ **F3 stage 1 confirmed** (the `width` animation). Cross-check by scrubbing p and watching whether `Layout` disappears outside the wipe windows.
- **`Update Layer Tree` every frame** ⇒ F3 stage 2 (clip-tree churn).
- **F8 localisation.** Scrub slowly through p ≈ 0.60 (the `.w-row` fly window) with the trace running. A step change in `Paint`/`Rasterize` duration entering that band ⇒ **F8 confirmed**. Enable **Rendering → Paint flashing**: if the whole strip flashes green each frame during the fly, the six rows are repainting their parent layer, which is exactly the F8 mechanism.
- **F14.** Confirm from the code path, not the trace: log inside `updateSec2` and check whether it runs while `rb >= 1`.

### Trace C — hard flick-scroll
Targets F4, F5, F11.

- **Main-thread-bound vs composite-bound** — the key discrimination:
  - If the **Main** track is saturated and the **Compositor** track is idle during a hitch ⇒ main-thread-bound ⇒ F1/F2/F3-layout/F8.
  - If **Main** is idle but **Compositor**/**GPU** tracks are busy and frames still drop ⇒ composite-bound ⇒ F3 stage 3 (render surface), F5 (texture eviction), F6 (layer count).
  - If **both** are idle and frames still look stuck ⇒ it is not a frame-rate problem at all; the page is rendering at 60fps with a stale canvas ⇒ **F4**, or the follower lag of **F11**.
- **F4 directly.** The frame-by-frame filmstrip is the cleanest evidence: if the surrounding chrome/text keeps moving while the video image is identical across consecutive screenshots, `want(i)` is missing and `draw` is returning early. Corroborate by instrumenting `main.js:153` to count `bmp === null` returns per second.
- **F5 / texture pressure.** In the Memory track, enable the **GPU Memory** counter. A sawtooth during scroll ⇒ bitmaps are being evicted and re-uploaded. Compare with `LRU_MAX` dropped to 8 — if the sawtooth flattens and stutter improves, **F5 confirmed**.
- **F11.** Not a trace finding — measure it by eye. Scrub slowly and watch whether the image trails the cursor. 125 ms is clearly perceptible.

### Layer inspection (no trace needed)
Targets F3 stage 3, F6.

DevTools → **Layers** panel, with the scroll parked mid-wipe (p ≈ 0.35, inside the `reveal--a` transition).

- Count the layers. Six full-viewport ones (3 video + 3 canvas) ⇒ **F6 confirmed**.
- Select the `reveal--a` subtree and read the **compositing reasons** and **memory estimate**. A render surface sized ~`(72vw+72vh)²` ⇒ **F3 stage 3 confirmed**, and it moves to the top of the list.
- Compare against p ≈ 0.68 (inside the `reveal--b` transition, `--angle:0deg`). If `reveal--b` shows no such surface while `reveal--a` does, the non-axis-aligned-clip hypothesis is proven and the `clip-path` fix in F3 is the right call.

---

## Suggested order of work

1. **F2** — cache the block metrics. One small change, removes up to 4 forced reflows per frame, essentially no risk. Do this first regardless of what the traces say.
2. **F7** — `innerWidth` only. Two characters. Rules out the entire mobile-specific class of stutter.
3. **F5(a)** — `LRU_MAX: 24 → 8`. One line, cuts bitmap memory by ~170 MB.
4. **Trace** (A, B, C, plus the Layers panel). Everything below this line should be justified by the trace, not by this document.
5. **F4** — window sizing and the never-paint-stale fallback. The most likely fix for the literal "video freezes" symptom.
6. **F1** — Worker migration. Largest transient win, largest implementation cost.
7. **F3 / F6** — the layer-count and clip-geometry work. Consider going straight to the single-canvas rewrite sketched in F3, which subsumes F3, F5, F6, and F10 together.
8. **F11** — tune the follower. Cheap, and it addresses "lags" in a way none of the others do.
