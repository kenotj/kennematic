'use client';

/* KENNEMATIC — project lists for client components.
 *
 * The root layout (server) fetches once per revalidation and provides both
 * lists here, so deep client components (MenuOverlay via Header AND
 * SiteHeader, Works inside the landing plate) read them without four levels
 * of prop drilling.
 */

import { createContext, useContext } from 'react';

const ProjectsContext = createContext({ projects: [], featured: [] });

export function ProjectsProvider({ projects, featured, children }) {
  return (
    <ProjectsContext.Provider value={{ projects, featured }}>{children}</ProjectsContext.Provider>
  );
}

export const useProjects = () => useContext(ProjectsContext);
