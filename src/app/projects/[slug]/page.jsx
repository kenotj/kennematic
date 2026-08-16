/* KENNEMATIC — project case study. Plain server-rendered page: no
 * PlateProvider, no frame bank, ordinary scrolling. */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import SiteHeader from '../../../components/site/SiteHeader.jsx';
import MediaPlaceholder from '../../../components/site/MediaPlaceholder.jsx';
import { PROJECTS, getProject } from '../../../lib/projects.js';

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return {};
  return {
    title: `${project.title} — ${project.client} · KENNEMATIC`,
    description: project.summary,
  };
}

export default async function ProjectPage({ params }) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const index = PROJECTS.indexOf(project);
  const prev = PROJECTS[(index - 1 + PROJECTS.length) % PROJECTS.length];
  const next = PROJECTS[(index + 1) % PROJECTS.length];

  return (
    <>
      <SiteHeader />
      <main
        className="mx-auto w-full max-w-[min(92vw,1200px)]"
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

        {/* process sections */}
        <div className="mt-[max(48px,6vw)] flex flex-col gap-[max(32px,4vw)]">
          {project.sections.map((section) => (
            <section key={section.heading} className="grid gap-[12px] md:grid-cols-[200px_1fr]">
              <h2 className="m-0 text-[length:var(--fs-micro)] uppercase tracking-[0.12em] opacity-70">
                {section.heading}
              </h2>
              <p className="m-0 max-w-[65ch] text-[length:var(--fs-ui)] leading-[150%]">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        {/* media */}
        <div className="mt-[max(48px,6vw)] grid gap-[max(16px,1.6327vw)] md:grid-cols-2">
          {project.media.map((m) => (
            <MediaPlaceholder key={m.label} label={m.label} ratio={m.ratio} />
          ))}
        </div>

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
