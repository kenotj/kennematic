# KENNEMATIC

The personal portfolio of Kenneth Ong — **KENNEMATIC** (kinetics × cinematics), a motion & kinetic design practice.

The landing page is a black, scroll-driven cinematic one-pager: a single 900vh scroll runway where everything you see is a fixed layer driven by one number — how far down that runway you are. One continuous background video is scrubbed by scroll, two rotating "wipe" reveals slice it open, a projects section drifts through the middle, and the typography exits in 3D toward the camera and comes back at the end.

Typography is **Montserrat** throughout (via `next/font`), with weight and italic contrast doing the work three families used to. The palette is black, white, and `#EB0004` — the red is used for focus rings only. Chrome elements (nav pill, menu sheet, project cards) share one liquid-glass recipe: the `.glass` class in `globals.css`, whose backdrop-filter frosts whatever video layer sits behind it.

Beyond the landing scroll there are conventional sub-pages (no scroll engine, ordinary scrolling):

| Route | What it is |
| --- | --- |
| `/projects` | Index of all projects |
| `/projects/[slug]` | Per-project case study — hero, process sections, media placeholders (data in `src/lib/projects.js`) |
| `/about` | Bio, skills/tools, what "kennematics" means |
| `/playground` | Loose experiments and one-off studies |

React 19 + Next.js (App Router) + Tailwind v4 + Framer Motion. The original vanilla implementation of the scroll engine (built for a fictional studio, "PLATE®") lives in [`legacy/`](./legacy) (`index.html`, `style.css`, `main.js`) and is kept as the behavioral reference — engine-file header comments still carry that name.

## Run it

```bash
npm install
npm run dev      # next dev server
npm run build    # production build to .next/
npm start        # serve the built output
```

## Architecture

### One number drives everything

`.runway` is the only element in normal document flow. It is `900vh` tall; every other layer is `position: fixed`. That gives the page ~800vh of scrollable distance and nothing that scrolls visually — scrolling only moves an abstraction.

That abstraction is `progress` (`p`), a single normalized MotionValue:

```
p = clamp01(scrollY / runwayPx)      runwayPx = scrollHeight - innerHeight
```

Every animated property on the page is a pure function of `p`. Nothing is event-driven, nothing is stateful across frames except the video scrub smoothing. One rAF loop reads `p` and writes; components subscribe to derived MotionValues rather than re-rendering.

### Metrics are cached, never measured mid-animation

Reading `offsetTop` / `offsetHeight` during an animation frame forces synchronous layout and destroys the frame budget — especially with three video layers compositing. So layout is measured once into a `metrics` object (on load, on resize/orientationchange, debounced ~120ms, plus a cheap viewport-size check per frame) and only read from there afterward.

`metrics` caches the viewport size, `runwayPx`, the wipe duration expressed as a fraction of `p`, and the works strip's start/pin offsets. The wipe fraction is derived from a target of 80vh of scrolling per wipe and then **capped at 0.28**, so a short runway can never hand a single wipe a third of the page.

### Three video layers, one decoded take

The Stage, Reveal A, and Reveal B each paint video. They are not three videos — they are three views onto the **same** decoded frame bank, offset in time by a 1-second lead each:

```
span = dur - 2 * lead            (lead = 1s)
t_i  = p * span + i * lead       (i = 0 stage, 1 reveal A, 2 reveal B)
```

The consequence is the point of the whole design: when Reveal A wipes open across the Stage, the footage inside the wipe is the *same shot*, one second further along. The plate reads as one continuous take being progressively revealed rather than as three clips cutting between each other. The lead reservation on both ends is why `span` subtracts `2 * lead` — it guarantees layer 2 never runs past the end of the source.

Each layer smooths toward its target with an exponential lerp (`tau = 8`) and snaps when within 0.002s, so fast scrolls stay fluid instead of strobing.

### The frame bank

`<video currentTime = x>` scrubbing is not frame-accurate and stutters badly under scroll. So the site decodes the video up front:

1. **MP4Box** fetches the MP4 and demuxes it — samples, timescale, codec string, and the codec description box (`avcC` / `hvcC` / `vpcC` / `av1C`).
2. **WebCodecs `VideoDecoder`** decodes *every* frame, with backpressure so no more than ~24 frames are in flight.
3. Each decoded frame is drawn to an offscreen canvas and stored as a **WebP blob** (quality 0.82) keyed by timestamp. Blobs, not bitmaps — a full film's worth of `ImageBitmap`s would not fit in memory.
4. At draw time, blobs near the playhead are promoted to `ImageBitmap`s in a shared, device-aware **LRU of 24–32**, with a velocity-aware prefetch window biased in the direction of travel. Evicted bitmaps are explicitly `close()`d.

Scrubbing then becomes a binary search for the nearest timestamp plus one `drawImage`. The canvas fades in (`is-live`) only once it has actually painted, so you never see an empty black rectangle.

**Every stage of this is optional.** No `VideoDecoder`, no MP4Box, a fetch failure, a decoder error, an empty bank, or a 60s watchdog timeout all revert the clip to plain `<video currentTime>` scrubbing. Decode failure additionally gets one retry with `hardwareAcceleration: 'prefer-software'` before giving up. That fallback path is why the page still works end-to-end in browsers without WebCodecs — it just scrubs less crisply.

The bank is built **once** on the Stage clip and then shared by reference with both reveals. Three decodes of the same file would be three times the memory for identical pixels.

## The scroll map

Two anchors structure the page: reveal A opens at `A = 1/3` and reveal B opens at `B = 2/3`.

| `p` range | What happens |
| --- | --- |
| 0 → 0.083 | Title exits in 3D (translate Z, quadratic opacity falloff, blur) |
| 0.095 → 0.178 | Services strip rises in and out (same rise contract as About, in the gap before it) |
| 0.18 → 0.27 | About paragraph rises in (expo-out) |
| 0.333 | **Reveal A** begins its wipe — a −45° rotating slice, opened by an animated `clip-path: inset()` |
| 0.333 → 0.373 | About paragraph rises out |
| ~0.426 → ~0.431 | Stage fades out under reveal A (final 93–98% of the wipe), then is hidden outright once covered |
| 0.43 → 0.77 | Projects section visible (rows are links to `/projects/[slug]`) |
| 0.44 → 0.56 | Projects strip ramps from its emerge offset to its pinned position |
| 0.44 → 0.49 | Projects title enters (opacity × expo, blur falling off as `(1−o)²·6px`) |
| 0.565 → 0.655 | Project cards fly out — staggered 0.20 apart within each pair, 0.60 long each, left and right pairs leaving in opposite directions with quadratic blur |
| 0.667 | **Reveal B** begins its wipe — unrotated, full-viewport, covering the projects section and reveal A |
| 0.74 → 0.917 | Three stats in three back-to-back slots (~0.0589 each): 34% in, 40% hold, remainder out |
| 0.917 → 1 | Title returns, reversing its 3D exit |
| 0.955 → 0.985 | Contact block rises in at viewport centre and holds — the rest state is wordmark + contact |

Blocks in the works strip additionally fade against a horizontal band as they travel: an entry ramp over 220px above a 130px highline and an exit ramp over the last 160px before the viewport bottom, both expo-eased, taking the minimum of the two.

## Debugging

`window.__plate` is a read-only diagnostic surface:

| Member | What it gives you |
| --- | --- |
| `map` | The anchor constants — `titleOut`, `titleIn`, `wipe`, `A`, `B`, `runwayPx`, `vw`, `vh` |
| `metrics` | The cached layout (viewport, runway, works strip start/pin offsets) |
| `p()` | Current scroll progress |
| `clips` | The three clip objects — mode (`'video'` \| `'bank'`), bank length, duration, LRU state |
| `seek(i, t)` | Paint clip `i` at time `t` directly |
| `drive(p)` | Run the entire scroll map at an arbitrary `p` without scrolling |

### Two gotchas worth knowing about

**`drive(p)` exists because a visible tab fights you.** In a foreground tab the rAF loop runs every frame and immediately overwrites anything you set by hand — you cannot poke a value in the console and watch it. `drive(p)` is for driving the page in hidden panes or headless capture, where the rAF loop is throttled or stubbed out.

**Headless Chrome cannot screenshot this page once `scrollY > 0`.** The screenshot comes back black — even an element forced to `z-index: 99` vanishes. This is a headless compositing interaction with the fixed full-viewport video layers, not a bug in the page. The workaround for any visual check is: stay at scroll 0, stub `requestAnimationFrame` so the loop cannot overwrite you, and use `drive(p)` to place the page at the state you want to see.

## `prefers-reduced-motion`

Reduced motion is treated as a real mode, not a disabled site. Fades are kept everywhere; what is removed is travel, blur, and expensive machinery:

- All `translate3d` / `translateY` / `translateX` travel is dropped — elements fade in place.
- All motion blur is dropped (title exit, about rise, works entry, row fly-out).
- The **frame bank is skipped entirely** — no fetch, no demux, no decode.
- The works strip is **pinned outright** at its final position rather than ramping into it.
- The scrub **holds frame 0** — the video does not move with scroll at all.

The full scroll map still runs; you get the same content in the same order, without the motion.
