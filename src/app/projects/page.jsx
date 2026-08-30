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
        className="mx-auto w-[calc(100%-2rem)] max-w-[1200px] pt-[calc(var(--spacing-page)*2+56px)] pb-[calc(var(--spacing-page)*4+env(safe-area-inset-bottom))] sm:w-[92vw]"
      >
        <h1 className="font-display text-sub-stat leading-[100%] font-extrabold uppercase">
          Projects
        </h1>
        <ProjectIndexList projects={rows} />
      </main>
    </>
  );
}
