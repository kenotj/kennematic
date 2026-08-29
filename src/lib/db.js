/* KENNEMATIC — project data access (server only).
 *
 * Reads the `projects` table on Neon (Vercel Postgres). Every media URL in a
 * row (thumb, media[], posters) points at the Bunny CDN; the table stores only
 * copy and URLs. Pages that call these run with ISR (`revalidate` in the root
 * layout), so the DB is hit at build/revalidate time, not per request.
 *
 * Without DATABASE_URL the seed array serves instead, so local dev and CI
 * build before the database exists.
 *
 * Row shape handed to the UI (camel-cased, ordering columns stripped):
 *   { slug, title, client, category, year, role, summary,
 *     thumb: { kind, url, poster } | null,
 *     sections: [{ heading, body }],
 *     media: [{ kind, url?, poster?, ratio, label }] }
 */

import { neon } from '@neondatabase/serverless';

import { SEED_PROJECTS } from './seedProjects.js';

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

const fromRow = (r) => ({
  slug: r.slug,
  title: r.title,
  client: r.client,
  category: r.category,
  year: r.year,
  role: r.role,
  summary: r.summary,
  thumb: r.thumb ?? null,
  sections: r.sections ?? [],
  media: r.media ?? [],
});

/** Every published project, in canonical order (menu, index, prev/next). */
export async function getAllProjects() {
  if (!sql) return SEED_PROJECTS;
  const rows = await sql`
    select * from projects where published order by sort_order, id`;
  return rows.map(fromRow);
}

/** The landing strip. `limit 6` enforces the fly-choreography ceiling
 *  (3 cards per half) regardless of how many rows are flagged featured. */
export async function getFeaturedProjects() {
  if (!sql) return SEED_PROJECTS.slice(0, 6);
  const rows = await sql`
    select * from projects where published and featured
    order by featured_order, sort_order, id limit 6`;
  return rows.map(fromRow);
}

export async function getProject(slug) {
  if (!sql) return SEED_PROJECTS.find((p) => p.slug === slug) ?? null;
  const rows = await sql`
    select * from projects where slug = ${slug} and published limit 1`;
  return rows.length ? fromRow(rows[0]) : null;
}
