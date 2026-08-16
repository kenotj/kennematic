/* KENNEMATIC — scroll map constants. The choreography numbers are ported
 * verbatim from legacy/main.js; SERVICES_* and CONTACT_IN are additions that
 * sit inside verified gaps of that map (see Services.jsx / Contact.jsx). */

export const WIPE_VH = 80;
export const TITLE_Q = 0.25;
export const ABOUT_IN = [0.18, 0.27];
export const ABOUT_OUT = [0.333, 0.373];
/* Services occupies the dead window between title-exit end (titleOut ≈ 0.083)
   and about-in (0.18) — no existing timing moves to make room for it. */
export const SERVICES_IN = [0.095, 0.14];
export const SERVICES_OUT = [0.15, 0.178];
/* Contact rides the ending alongside the returning wordmark (titleIn ≈ 0.9167
   → 1). It rises in and holds — no out ramp; the rest state is the footer. */
export const CONTACT_IN = [0.955, 0.985];
export const SEC2_RAMP = [0.44, 0.56];
/* The cards now ride the upper (title) group, so they leave the screen as the
   strip lifts. FLY is pulled forward to land inside that lift — the cards fly
   apart on their way out, and the services block settles into the pin behind
   them. Past SEC2_RAMP[1] they'd be far above the viewport and the fly would
   play to nobody. */
export const FLY = [0.50, 0.565];
export const FLY_STEP = 0.20;
export const FLY_DUR = 0.60;
export const STAT_FROM = 0.74;
export const STAT_IN = 0.34;
export const STAT_HOLD = 0.40;
export const SEC2_ENTER = [0.44, 0.49];
export const SEC2_SHOW = [0.43, 0.77];
export const S2_EMERGE = 0.84;
export const PIN_FRAC = 0.66;
export const BAND_HL = 130;
export const BAND_TOP = 220;
export const BAND_BOT = 160;
export const LERP_TAU = 8;
export const SNAP = 0.002;
export const LRU_MAX = 24;
export const LEAD = 24;
export const WATCHDOG = 60000;
export const FADE_A = [0.93, 0.98];
export const WIPE_LEAD = 1;
export const A = 1 / 3;
export const B = 2 / 3;

/* derived */
export const titleOut = A * TITLE_Q;
export const titleIn = B + (1 - B) * (1 - TITLE_Q);

/* media */
export const VIDEO_SRC = 'https://r2.motionsites.dev/motionsites/assets/e3b8ef71df3e.mp4';

/* ---------------------------------------------------------------- content */

/* Project data lives in projects.js — it feeds both the landing rows and the
   /projects/[slug] case-study pages. */

export const CONTACT_EMAIL = 'kennethotj@gmail.com';

/* Services — the pinned block of the works strip (Works.jsx) and, in name-only
   form, the small "What I do" list on the title screen (Services.jsx). */
export const SERVICES = [
  {
    name: 'AI film direction',
    blurb: 'Concept, boards and shot design, taken through to a finished cut.',
  },
  {
    name: 'Advert content',
    blurb: 'Short-form spots built for brands, cut to run where they land.',
  },
  {
    name: 'Edit & grade',
    blurb: 'Story-first edits, finished with a look that holds at full res.',
  },
  {
    name: 'Motion & VFX',
    blurb: 'Titles, comps and clean-up that survive a close second look.',
  },
];

export const STATS = [
  { label: 'Films directed', num: '(34)' },
  { label: 'Adverts shipped', num: '(67)' },
  { label: 'Frames generated', num: '(2M)' },
];
