/* KENNEMATIC — project index. */

import SiteHeader from '../../components/site/SiteHeader.jsx';
import ProjectIndexList from '../../components/site/ProjectIndexList.jsx';
import { getAllProjects } from '../../lib/db.js';

export const metadata = {
  title: 'Projects · KENNEMATIC',
  description: 'Selected motion and kinetic design projects.',
};

export default async function ProjectsPage() {
  /* Only the row fields cross into the client component — sections and the
     full media list would ride along in the RSC payload for nothing. */
  const rows = (await getAllProjects()).map(({ slug, year, client, title, thumb }) => ({
    slug,
    year,
    client,
    title,
    thumb,
  }));
  return (
    <>
      <SiteHeader trail={[{ label: 'Projects' }]} />
      <main
        className="type-sub mx-auto w-full max-w-[min(92vw,1200px)]"
        style={{ padding: 'calc(var(--pad-header) * 2 + 56px) 0 calc(var(--pad-header) * 4)' }}
      >
        <h1 className="font-display font-extrabold uppercase text-stat leading-[100%]">
          Projects
        </h1>
        <ProjectIndexList projects={rows} />
      </main>
    </>
  );
}
