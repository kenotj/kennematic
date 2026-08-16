/* PLATE® — scroll map constants, ported verbatim from legacy/main.js */

export const WIPE_VH = 80;
export const TITLE_Q = 0.25;
export const ABOUT_IN = [0.18, 0.27];
export const ABOUT_OUT = [0.333, 0.373];
export const SEC2_RAMP = [0.44, 0.56];
export const FLY = [0.565, 0.655];
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

/* Left column: year first (.w-year, .w-brand, .w-name) */
export const WORKS_LEFT = [
  { year: '2024', brand: 'Aformo', name: 'No slow motion' },
  { year: '2023', brand: 'Vessel', name: 'No speed ramping' },
  { year: '2022', brand: 'Meridian', name: 'Away to another angle' },
];

/* Right column: year last (.w-brand, .w-name, .w-year) */
export const WORKS_RIGHT = [
  { brand: 'Halcyon', name: 'No on-screen text', year: '2025' },
  { brand: 'Cinder', name: 'One long take', year: '2024' },
  { brand: 'Northbound', name: 'No cuts', year: '2026' },
];

export const STATS = [
  { label: 'Clients', num: '(73)' },
  { label: 'Sets built', num: '(208)' },
  { label: 'Fixed in post', num: '(0)' },
];
