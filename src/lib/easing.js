/* PLATE® — easing / numeric helpers, ported verbatim from legacy/main.js */

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const expoOut = (t) => 1 - Math.pow(2, -10 * t);
export const easeIn = (t) => t * t;
/* ease in AND out — used where a scrubbed move has to settle into a hold and
   leave it again without a visible velocity step at either end */
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const norm = (v, a, b) => clamp01((v - a) / (b - a));
export const r3 = (v) => Math.round(v * 1000) / 1000;

/* snap a value to a fixed step — used to throttle style writes */
export const quantize = (v, step) => (step ? Math.round(v / step) * step : v);
