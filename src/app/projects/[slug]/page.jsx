/* KENNEMATIC — project case study. Plain server-rendered page: no
 * PlateProvider, no frame bank, ordinary scrolling.
 *
 * Layout rules, in one place because every ugly version of this page broke one
 * of them:
 *
 *   1. ONE SPINE. The section label hangs in the left margin; the copy AND its
 *      media both start at the content column's left edge. Media used to be a
 *      sibling of the section and spanned the whole container, so text and
 *      images never shared an edge. Two deliberate exceptions: the hero spans
 *      the container, which is what makes it read as the hero; and PORTRAIT
 *      media centres on the column instead (rule 4 leaves it narrower than the
 *      measure, and left-locking that much slack pulled the page off balance).
 *   2. GAPS ENCODE GROUPING. Three steps only: media within a row < copy to its
 *      media < section to section. A flat gap everywhere is what made the
 *      images look unattached to the text they belong to.
 *   3. ROWS ARE RATIO-PURE. See mediaRows() — mixed aspect ratios never share a
 *      row, and no row is left half-empty.
 *   4. NO SLOT IS TALLER THAN THE SCREEN. The content column is capped at the
 *      reading measure, which is a comfortable width and therefore a punishing
 *      height once a slot is portrait: the Coehl 9:16 hero filled the measure
 *      and came out nearly twice as tall, so the viewer met a wall of video
 *      with no way to see the shot whole. See mediaMaxWidth().
 */

import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import SiteHeader from '../../../components/site/SiteHeader.jsx';
import MediaPlaceholder from '../../../components/site/MediaPlaceholder.jsx';
import { LightboxProvider, LightboxTrigger } from '../../../components/site/Lightbox.jsx';
import { getAllProjects, getProject } from '../../../lib/db.js';

/* The three-step spacing scale. Named so the relationship between them stays
   visible at the call sites — the whole point is that they are not equal. */
const GAP_ROW = 'max(12px,1.2vw)'; /* between media sharing a row */
const GAP_BAND = 'max(20px,2.2vw)'; /* between copy and its media */
const GAP_SECTION = 'max(56px,6.5vw)'; /* between sections */

/* Rule 4's ceiling. See mediaMaxWidth() for why it is spent on width. */
const MEDIA_MAX_H = '72vh';

/* The width a slot may not exceed if its height is to stay under MEDIA_MAX_H.
 *
 * The cap is spent on WIDTH rather than height on purpose: `aspect-ratio` sizes
 * the box off the inline axis, so capping the width keeps one declaration in
 * charge of the whole figure. A `max-height` instead needs `width: auto`, which
 * shrinks the figure to its content and lets it drift off the spine — rule 1.
 *
 * Landscape slots never reach the cap (16/9 resolves to 128vh of width, far
 * past the column), so this is a no-op for everything but portrait.
 *
 * Paired with `margin-inline: auto` at the call site, which is what centres the
 * capped slot on the column (rule 1's second exception). That is a no-op for
 * anything the cap does not bind: a slot already filling the column has no
 * slack for auto margins to divide. */
function mediaMaxWidth(ratio) {
  const [w, h] = String(ratio).split('/').map(Number);
  if (!w || !h) return undefined;
  return `calc(${MEDIA_MAX_H} * ${w} / ${h})`;
}

export async function generateStaticParams() {
  return (await getAllProjects()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) return {};
  const title = `${project.title} — ${project.client} · KENNEMATIC`;
  const preview =
    project.thumb?.kind === 'video' ? project.thumb.poster : project.thumb?.url;
  const images = preview ? [{ url: preview }] : [];
  return {
    title,
    description: project.summary,
    openGraph: {
      title,
      description: project.summary,
      images,
    },
    twitter: {
      card: preview ? 'summary_large_image' : 'summary',
      title,
      description: project.summary,
      images,
    },
  };
}

/* Split a section's media into rows.
 *
 * Consecutive items sharing an aspect ratio form a run, and only a run pairs up
 * two-across — so a 16/9 still never sits beside a 4:3 screenshot with the row
 * height split between them. A run of odd length leads with one full-width item
 * and pairs the rest, which is why nothing ends on a half-width item with a
 * hole beside it. A run of one is simply full width.
 *
 * Born from Nature's "Approach" run is [16/9, 16/9, 4:3, 4:3, 4:3]: one pair of
 * stills, then the node-graph screenshot full width (where it is actually
 * legible) and the remaining two paired. */
function mediaRows(items) {
  const rows = [];
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j < items.length && items[j].ratio === items[i].ratio) j += 1;
    const run = items.slice(i, j);
    if (run.length % 2 === 1) rows.push([run.shift()]);
    for (let k = 0; k < run.length; k += 2) rows.push(run.slice(k, k + 2));
    i = j;
  }
  return rows;
}

/* A body like "Format: 30s spec advert · Budget: ~$100 · Sound: Artlist SFX" is
   a spec sheet wearing a paragraph's clothes, and it reads as a wall. When a
   body is three or more `Key: value` pairs separated by " · " it renders as a
   definition list; anything else returns null and falls through to prose, so
   ordinary copy containing a colon is untouched. */
function specPairs(body) {
  const parts = body.split(' · ');
  if (parts.length < 3) return null;
  const pairs = parts.map((part) => {
    const at = part.indexOf(': ');
    return at > 0 && at <= 24 ? [part.slice(0, at), part.slice(at + 2)] : null;
  });
  return pairs.every(Boolean) ? pairs : null;
}

/* One media slot — image, video, or placeholder while a file is pending.
   `autoplay` is for the hero: silent looping playback with controls still
   available; everything else waits to be played.

   The media carries no visible caption — the images are meant to read as the
   work itself, not as plates in a report. `label` still does real work: it is
   the alt text, the lightbox's accessible name, and what MediaPlaceholder shows
   while a file is pending.

   Images open in the lightbox, because object-cover means the page only ever
   shows a crop of them. Videos do not: they have their own controls, and a
   click on one means play. */
function CaseMedia({ m, autoplay = false, poster }) {
  if (!m.url) {
    return (
      <div style={{ maxWidth: mediaMaxWidth(m.ratio), marginInline: 'auto' }}>
        <MediaPlaceholder label={m.label} ratio={m.ratio} />
      </div>
    );
  }
  return (
    <figure
      className="m-0 overflow-hidden rounded-[2px] bg-white/[0.04]"
      style={{ aspectRatio: m.ratio, maxWidth: mediaMaxWidth(m.ratio), marginInline: 'auto' }}
    >
      {m.kind === 'video' ? (
        <video
          className="h-full w-full object-cover"
          src={m.url}
          poster={poster || m.poster || undefined}
          controls
          playsInline
          {...(autoplay ? { autoPlay: true, muted: true, loop: true } : { preload: 'metadata' })}
        />
      ) : (
        <LightboxTrigger url={m.url} label={m.label}>
          <img className="h-full w-full object-cover" src={m.url} alt={m.label} />
        </LightboxTrigger>
      )}
    </figure>
  );
}

/* The media belonging to one band of copy, already grouped into rows. */
function MediaRows({ items }) {
  return mediaRows(items).map((row) => (
    <div
      key={row[0].url || row[0].label}
      className={row.length > 1 ? 'grid sm:grid-cols-2' : ''}
      style={row.length > 1 ? { gap: GAP_ROW } : undefined}
    >
      {row.map((m) => (
        <CaseMedia key={m.url || m.label} m={m} />
      ))}
    </div>
  ));
}

/* label in the margin | content column. Every band on the page uses this, which
   is what keeps the left edge of the copy and the left edge of every image the
   same line all the way down.

   The column is capped at the reading measure rather than filling the grid
   track, so the copy and the media share a RIGHT edge too, not just a left one.
   Justified copy makes that edge exact. The cap has to live here rather than on
   the <p> for the media to inherit it, and the column carries --fs-ui so `ch`
   resolves against the type actually set in it. */
function Band({ label, children }) {
  return (
    <section className="grid gap-x-[max(16px,2vw)] gap-y-[10px] md:grid-cols-[152px_1fr]">
      {label ? (
        <h2 className="m-0 text-sub-micro tracking-[0.12em] uppercase opacity-70 md:pt-[calc((var(--text-sub-ui)*1.5-var(--text-sub-micro)*1.2)/2)]">
          {label}
        </h2>
      ) : (
        /* Holds the margin column open so an unlabelled band (the hero) still
           lands on the spine instead of sliding into the label's track. */
        <div aria-hidden="true" className="hidden md:block" />
      )}
      <div
        className="flex max-w-[65ch] flex-col text-sub-ui"
        style={{ gap: GAP_BAND }}
      >
        {children}
      </div>
    </section>
  );
}

export default async function ProjectPage({ params }) {
  const { slug } = await params;
  const [project, projects] = await Promise.all([getProject(slug), getAllProjects()]);
  if (!project) notFound();

  const index = projects.findIndex((p) => p.slug === slug);
  const prev = projects[(index - 1 + projects.length) % projects.length];
  const next = projects[(index + 1) % projects.length];

  /* Media placement: an item flagged `hero` leads the page directly under the
     header; an item with a `section` name renders inline right after that
     section's text; everything else lands in the gallery band at the bottom
     (hidden when empty). In Notion this maps to where the file sits — under a
     copy heading = inline, under "Media" = bottom gallery. */
  const hero = project.media.find((m) => m.hero && m.url);
  const placed = project.media.filter((m) => m !== hero);
  const sectionNames = new Set(project.sections.map((s) => s.heading));
  const inline = new Map();
  for (const m of placed) {
    if (!sectionNames.has(m.section)) continue;
    if (!inline.has(m.section)) inline.set(m.section, []);
    inline.get(m.section).push(m);
  }
  const gallery = placed.filter((m) => !sectionNames.has(m.section));

  /* The lightbox's running order. Built by walking the page the way it renders
     — hero, then each section's inline media in section order, then the gallery
     — so stepping through with the arrows follows what the viewer just scrolled
     past. Videos are excluded; only images open. */
  const zoomable = [
    hero,
    ...project.sections.flatMap((s) => inline.get(s.heading) ?? []),
    ...gallery,
  ].filter((m) => m?.url && m.kind !== 'video');

  return (
    <LightboxProvider items={zoomable}>
      <SiteHeader
        trail={[{ label: 'Projects', href: '/projects' }, { label: project.title }]}
      />
      <main
        className="mx-auto w-[calc(100%-2rem)] max-w-[1200px] pt-[calc(var(--spacing-page)*2+max(88px,8.1vw))] pb-[calc(var(--spacing-page)*4+env(safe-area-inset-bottom))] sm:w-[92vw]"
        /* Top padding clears the absolute header (pill + breadcrumb) and then
           opens the gap down to the eyebrow. That gap runs 2.5x its old size
           from tablet up; the 88px floor clears a wrapped mobile breadcrumb. */
      >
        {/* hero copy — the one block that sits at the container edge with the
            hero media, so the title and the film read as a single opening */}
        <header className="flex flex-col gap-[max(12px,1.6327vw)]">
          <p className="text-sub-micro tracking-[0.12em] uppercase opacity-70">
            {project.category} · {project.client} · {project.year} · {project.role}
          </p>
          <h1 className="font-display text-sub-stat leading-[100%] font-extrabold uppercase">
            {project.title}
          </h1>
          <p className="max-w-[60ch] hyphens-auto text-left text-sub-ui leading-[150%] sm:text-justify">
            {project.summary}
          </p>
        </header>

        {/* hero media — on the same spine and the same measure as every other
            image on the page, so nothing outruns the copy. Falls back to the
            card poster so the slot is never a black rectangle before the video
            paints its first frame. */}
        {hero && (
          <div className="mt-[max(28px,3.4vw)]">
            <Band>
              <CaseMedia m={hero} autoplay poster={project.thumb?.poster} />
            </Band>
          </div>
        )}

        {/* process sections, each with its media inside the content column */}
        <div className="flex flex-col" style={{ marginTop: GAP_SECTION, gap: GAP_SECTION }}>
          {project.sections.map((section) => {
            const specs = specPairs(section.body);
            return (
              <Band key={section.heading} label={section.heading}>
                {specs ? (
                  <dl className="m-0 grid grid-cols-1 gap-x-[max(16px,1.6vw)] gap-y-1 leading-[150%] sm:grid-cols-[minmax(0,max-content)_1fr] sm:gap-y-2">
                    {specs.map(([term, value]) => (
                      <Fragment key={term}>
                        <dt className="m-0 mt-3 whitespace-nowrap opacity-55 first:mt-0 sm:mt-0">{term}</dt>
                        <dd className="m-0">{value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                ) : (
                  /* Justified, so the copy squares off against the media below
                     it. Hyphenation is what keeps that from opening rivers. */
                  <p className="m-0 hyphens-auto text-left leading-[150%] sm:text-justify">{section.body}</p>
                )}
                {inline.has(section.heading) && <MediaRows items={inline.get(section.heading)} />}
              </Band>
            );
          })}

          {/* remaining media — only what wasn't placed inline. Labelled and on
              the same spine, so it reads as another band rather than a slab of
              images that lost its heading. */}
          {gallery.length > 0 && (
            <Band label="Gallery">
              <MediaRows items={gallery} />
            </Band>
          )}
        </div>

        {/* footer nav */}
        <nav
          className="grid grid-cols-2 items-start gap-4 border-t border-white/[0.12] text-sub-ui md:flex md:items-baseline md:justify-between"
          style={{ marginTop: GAP_SECTION, paddingTop: GAP_BAND }}
        >
          <Link href={`/projects/${prev.slug}`} className="min-w-0 underline hover:opacity-[.65]">
            ← {prev.title}
          </Link>
          <Link href="/projects" className="order-first col-span-2 text-center text-sub-micro tracking-[0.12em] uppercase opacity-70 hover:opacity-100 md:order-none md:col-auto">
            All projects
          </Link>
          <Link href={`/projects/${next.slug}`} className="min-w-0 text-right underline hover:opacity-[.65]">
            {next.title} →
          </Link>
        </nav>
      </main>
    </LightboxProvider>
  );
}
