/* KENNEMATIC — project index. */

import Link from 'next/link';

import SiteHeader from '../../components/site/SiteHeader.jsx';
import { getAllProjects } from '../../lib/db.js';

export const metadata = {
  title: 'Projects · KENNEMATIC',
  description: 'Selected motion and kinetic design projects.',
};

export default async function ProjectsPage() {
  const projects = await getAllProjects();
  return (
    <>
      <SiteHeader trail={[{ label: 'Projects' }]} />
      <main
        className="mx-auto w-full max-w-[min(92vw,1200px)]"
        style={{ padding: 'calc(var(--pad-header) * 2 + 56px) 0 calc(var(--pad-header) * 4)' }}
      >
        <h1 className="font-display font-extrabold uppercase text-stat leading-[100%]">
          Projects
        </h1>
        <ul className="m-0 mt-[max(32px,4vw)] flex list-none flex-col p-0">
          {projects.map((p) => (
            <li key={p.slug} className="border-b border-white/15 first:border-t">
              <Link
                href={`/projects/${p.slug}`}
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
      </main>
    </>
  );
}
