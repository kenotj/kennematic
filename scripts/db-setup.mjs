/* KENNEMATIC — create + seed the Neon `projects` table.
 *
 *   node scripts/db-setup.mjs
 *
 * Reads DATABASE_URL from the environment or .env.local. Idempotent: creates
 * the table if missing and upserts the seed rows by slug (real edits made in
 * the Neon console to OTHER columns than the seeded ones survive re-runs only
 * for rows not in the seed; once real content is in the table, delete the
 * corresponding seed entries from src/lib/seedProjects.js).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { neon } from '@neondatabase/serverless';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const envFile = await readFile(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (env or .env.local). Create the Neon DB first.');
  process.exit(1);
}

const { SEED_PROJECTS } = await import('../src/lib/seedProjects.js');
const sql = neon(process.env.DATABASE_URL);

await sql`
  create table if not exists projects (
    id serial primary key,
    slug text unique not null,
    title text not null,
    client text,
    category text,
    year text,
    role text,
    summary text,
    thumb jsonb,
    sections jsonb not null default '[]'::jsonb,
    media jsonb not null default '[]'::jsonb,
    featured boolean not null default false,
    featured_order int,
    sort_order int not null default 0,
    published boolean not null default true,
    updated_at timestamptz not null default now()
  )`;
console.log('table ready: projects');

for (const [i, p] of SEED_PROJECTS.entries()) {
  await sql`
    insert into projects
      (slug, title, client, category, year, role, summary, thumb, sections, media,
       featured, featured_order, sort_order, published)
    values
      (${p.slug}, ${p.title}, ${p.client}, ${p.category}, ${p.year}, ${p.role},
       ${p.summary}, ${p.thumb ?? null}, ${JSON.stringify(p.sections)},
       ${JSON.stringify(p.media)}, true, ${i}, ${i}, true)
    on conflict (slug) do update set
      title = excluded.title, client = excluded.client, category = excluded.category,
      year = excluded.year, role = excluded.role, summary = excluded.summary,
      thumb = excluded.thumb, sections = excluded.sections, media = excluded.media,
      updated_at = now()`;
  console.log(`  upserted: ${p.slug}`);
}
const [{ count }] = await sql`select count(*)::int as count from projects`;
console.log(`done — ${count} row(s) in projects`);
