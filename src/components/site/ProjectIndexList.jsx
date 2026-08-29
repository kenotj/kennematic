'use client';

/* KENNEMATIC — project index rows with a hover preview.
 *
 * The index is a text list; the preview is what makes it browsable. On hover a
 * small 16:9 loop of the project's card thumb rides the cursor, so the eye
 * never leaves the row it is reading. One preview element is reused for every
 * row — the video is keyed by slug so switching rows remounts it and the loop
 * restarts from frame one rather than resuming mid-shot.
 *
 * Position is written to MotionValues (spring-damped, so the tile trails the
 * cursor instead of snapping to it) and never to state; the only state is
 * which row is active, which changes at most once per row crossing.
 *
 * Coarse pointers get nothing — there is no hover to preview with, and the tap
 * would just fire the link. prefers-reduced-motion keeps the preview but drops
 * the trailing spring and the video, showing the poster still instead.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

/* Half the preview's width/height, used to keep the tile inside the viewport
   when the cursor runs along the top edge or the far right of a row. */
const PREVIEW_W = 300;
const PREVIEW_H = (PREVIEW_W * 9) / 16;

export default function ProjectIndexList({ projects }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(null);
  /* Set once on mount rather than read per event: matchMedia in a pointermove
     handler is a layout read on every frame. */
  const [fine, setFine] = useState(false);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const spring = { stiffness: 420, damping: 40, mass: 0.6 };
  const smoothX = useSpring(rawX, spring);
  const smoothY = useSpring(rawY, spring);
  const x = reduced ? rawX : smoothX;
  const y = reduced ? rawY : smoothY;

  useEffect(() => {
    setFine(matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

  const track = useCallback(
    (e) => {
      const half = PREVIEW_W / 2 + 12;
      rawX.set(Math.min(Math.max(e.clientX, half), window.innerWidth - half));
      rawY.set(Math.max(e.clientY, PREVIEW_H / 2 + 12));
    },
    [rawX, rawY],
  );

  /* Jump the tile to the cursor before it fades in, so the first row entered
     doesn't have it flying across the page from wherever the spring rested. */
  const enter = useCallback(
    (project) => (e) => {
      if (!fine) return;
      const half = PREVIEW_W / 2 + 12;
      const px = Math.min(Math.max(e.clientX, half), window.innerWidth - half);
      const py = Math.max(e.clientY, PREVIEW_H / 2 + 12);
      rawX.set(px);
      rawY.set(py);
      smoothX.jump(px);
      smoothY.jump(py);
      setActive(project);
    },
    [fine, rawX, rawY, smoothX, smoothY],
  );

  return (
    <>
      <ul
        className="m-0 mt-[max(32px,4vw)] flex list-none flex-col p-0"
        onPointerMove={fine && active ? track : undefined}
        onPointerLeave={() => setActive(null)}
      >
        {projects.map((p) => (
          <li key={p.slug} className="border-b border-white/15 first:border-t">
            <Link
              href={`/projects/${p.slug}`}
              onPointerEnter={enter(p)}
              /* Keyboard focus moves the row without a cursor to anchor the
                 tile to, so the preview stays out of it entirely. */
              onFocus={() => setActive(null)}
              className="flex flex-wrap items-baseline gap-x-[24px] gap-y-[4px] py-[max(16px,1.6vw)] [transition:opacity_200ms_linear] hover:opacity-[.65] focus-visible:[outline:2px_solid_var(--red)] focus-visible:[outline-offset:4px]"
            >
              <span className="text-[length:var(--fs-micro)] opacity-70">{p.year}</span>
              <span className="text-[length:var(--fs-ui)] underline">{p.client}</span>
              <span className="text-[length:var(--fs-work)] font-display font-extrabold">
                {p.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <AnimatePresence>
        {active?.thumb?.url && (
          <motion.div
            key="preview"
            aria-hidden="true"
            className="pointer-events-none fixed left-0 top-0 z-40 overflow-hidden rounded-[4px] bg-white/[0.04]"
            style={{ x, y, width: PREVIEW_W, height: PREVIEW_H, translateX: '-50%', translateY: '-50%' }}
            initial={{ opacity: 0, scale: reduced ? 1 : 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {active.thumb.kind === 'video' && !reduced ? (
              <video
                key={active.slug}
                className="h-full w-full object-cover"
                src={active.thumb.url}
                poster={active.thumb.poster || undefined}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                className="h-full w-full object-cover"
                src={
                  active.thumb.kind === 'video'
                    ? active.thumb.poster || active.thumb.url
                    : active.thumb.url
                }
                alt=""
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
