/* KENNEMATIC — placeholder media slot for sub-pages.
 *
 * Stands in for real stills/clips until they exist: a seeded CSS gradient
 * (per-label, so a page's slots don't all look identical) with a small
 * uppercase caption. Swap for <Image>/<video> per slot when real media lands.
 */

/* Tiny deterministic hash — only needs to spread labels across a few looks. */
function seed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 997;
  return h;
}

export default function MediaPlaceholder({ label, ratio = '16/9' }) {
  const s = seed(label);
  const angle = 110 + (s % 7) * 20; // 110°–230°
  const a = 8 + (s % 5) * 2; //  8%–16% gray
  const b = 18 + (s % 4) * 3; // 18%–27% gray

  return (
    <figure
      className="m-0 grid place-items-center overflow-hidden rounded-[2px]"
      style={{
        aspectRatio: ratio,
        background: `linear-gradient(${angle}deg, hsl(0 0% ${a}%), hsl(0 0% ${b}%))`,
      }}
    >
      <figcaption className="text-[length:var(--fs-micro)] uppercase tracking-[0.12em] opacity-60">
        {label}
      </figcaption>
    </figure>
  );
}
