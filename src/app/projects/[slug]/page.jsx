/* KENNEMATIC — project case study. Plain server-rendered page: no
 * PlateProvider, no frame bank, ordinary scrolling. */

import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import SiteHeader from '../../../components/site/SiteHeader.jsx';
import MediaPlaceholder from '../../../components/site/MediaPlaceholder.jsx';
import { getAllProjects, getProject } from '../../../lib/db.js';

export async function generateStaticParams() {
  return (await getAllProjects()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) return {};
  return {
    title: `${project.title} — ${project.client} · KENNEMATIC`,
    description: project.summary,
  };
}

/* One media slot — image, video, or placeholder while a file is pending.
   `autoplay` is for the hero: silent looping playback with controls still
   available; everything else waits to be played. */
function CaseMedia({ m, autoplay = false, className = '' }) {
  if (!m.url) return <MediaPlaceholder label={m.label} ratio={m.ratio} />;
  return (
    <figure
      className={`m-0 overflow-hidden rounded-[2px] ${className}`}
      style={{ aspectRatio: m.ratio }}
    >
      {m.kind === 'video' ? (
        <video
          className="h-full w-full object-cover"
          src={m.url}
          poster={m.poster || undefined}
          controls
          playsInline
          {...(autoplay ? { autoPlay: true, muted: true, loop: true } : { preload: 'metadata' })}
        />
      ) : (
        <img className="h-full w-full object-cover" src={m.url} alt={m.label} />
      )}
    </figure>
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
     section's text; everything else lands in the gallery grid at the bottom
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

  return (
    <>
      <SiteHeader
        trail={[{ label: 'Projects', href: '/projects' }, { label: project.title }]}
      />
      <main
        className="type-sub mx-auto w-full max-w-[min(92vw,1200px)]"
        style={{ padding: 'calc(var(--pad-header) * 2 + 56px) 0 calc(var(--pad-header) * 4)' }}
      >
        {/* hero */}
        <header className="flex flex-col gap-[max(12px,1.6327vw)]">
          <p className="text-[length:var(--fs-micro)] uppercase tracking-[0.12em] opacity-70">
            {project.category} · {project.client} · {project.year} · {project.role}
          </p>
          <h1 className="font-display font-extrabold uppercase text-stat leading-[100%]">
            {project.title}
          </h1>
          <p className="max-w-[60ch] text-[length:var(--fs-ui)] leading-[140%]">
            {project.summary}
          </p>
        </header>

        {/* hero media */}
        {hero && <CaseMedia m={hero} autoplay className="mt-[max(32px,4vw)]" />}

        {/* process sections, with their media littered inline where assigned */}
        <div className="mt-[max(48px,6vw)] flex flex-col gap-[max(32px,4vw)]">
          {project.sections.map((section) => (
            <Fragment key={section.heading}>
              <section className="grid gap-[12px] md:grid-cols-[200px_1fr]">
                <h2 className="m-0 text-[length:var(--fs-micro)] uppercase tracking-[0.12em] opacity-70">
                  {section.heading}
                </h2>
                <p className="m-0 max-w-[65ch] text-[length:var(--fs-ui)] leading-[150%]">
                  {section.body}
                </p>
              </section>
              {inline.has(section.heading) && (
                <div
                  className={`grid gap-[max(16px,1.6327vw)] ${
                    inline.get(section.heading).length > 1 ? 'md:grid-cols-2' : ''
                  }`}
                >
                  {inline.get(section.heading).map((m) => (
                    <CaseMedia key={m.label} m={m} />
                  ))}
                </div>
              )}
            </Fragment>
          ))}
        </div>

        {/* remaining media — only what wasn't placed inline */}
        {gallery.length > 0 && (
          <div className="mt-[max(48px,6vw)] grid gap-[max(16px,1.6327vw)] md:grid-cols-2">
            {gallery.map((m) => (
              <CaseMedia key={m.label} m={m} />
            ))}
          </div>
        )}

        {/* footer nav */}
        <nav className="mt-[max(56px,7vw)] flex flex-wrap items-baseline justify-between gap-[16px] text-[length:var(--fs-ui)]">
          <Link href={`/projects/${prev.slug}`} className="underline hover:opacity-[.65]">
            ← {prev.title}
          </Link>
          <Link href="/projects" className="uppercase text-[length:var(--fs-micro)] opacity-70 hover:opacity-100">
            All projects
          </Link>
          <Link href={`/projects/${next.slug}`} className="underline hover:opacity-[.65]">
            {next.title} →
          </Link>
        </nav>
      </main>
    </>
  );
}
