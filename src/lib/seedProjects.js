/* KENNEMATIC — seed / fallback project data.
 *
 * Canonical content now lives in the Neon `projects` table (see lib/db.js and
 * scripts/db-setup.mjs, which seeds the table from this file). This array is
 * the local fallback when DATABASE_URL is unset, so dev works before the DB
 * exists.
 *
 * One flat array feeds both surfaces:
 *   - the landing "Featured projects" card strip (all entries, in order)
 *   - the /projects/[slug] case-study pages
 *
 * All copy here is PLACEHOLDER — swap in real projects field-for-field.
 *
 * Card ceiling: the landing fly choreography solves
 * easeIn((u - index * FLY_STEP) / FLY_DUR) with FLY_STEP = 0.20, FLY_DUR = 0.60,
 * where index is the card's position WITHIN its half (left pair / right pair).
 * Index 2 is the last that completes inside the window (0.4 + 0.6 = 1.0), so
 * AT MOST 3 CARDS PER HALF — 6 total. Beyond that, extras never finish flying.
 */

export const SEED_PROJECTS = [
  {
    slug: 'synthetic-parfum-spot',
    title: 'Parfum spot',
    client: 'Aformo',
    category: 'AI Advert',
    year: '2025',
    role: 'AI direction & edit',
    summary:
      'A 30-second fragrance advert shot entirely with generative video — impossible macro perfume physics, directed and cut like a real spot.',
    sections: [
      {
        heading: 'Problem',
        body: 'The launch needed luxury-grade tabletop footage — liquid crowns, slow glass, floating petals — on a budget that ruled out a physical shoot.',
      },
      {
        heading: 'Approach',
        body: 'Directed the spot in generated passes: boards first, then shot-by-shot prompting for lensing and light continuity, then a real edit and grade in Resolve so it cuts like footage, not like clips.',
      },
      {
        heading: 'Outcome',
        body: 'One hero spot, six cutdowns for social, and a look-book the brand reused for stills — at a fraction of a tabletop day rate.',
      },
    ],
    media: [
      { kind: 'gradient', ratio: '16/9', label: 'Hero frame' },
      { kind: 'gradient', ratio: '4/3', label: 'Shot boards' },
      { kind: 'gradient', ratio: '16/9', label: 'Grade before / after' },
    ],
  },
];

