/* KENNEMATIC — project data.
 *
 * One flat array feeds both surfaces:
 *   - the landing "Featured projects" card strip (all four, in order)
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

export const PROJECTS = [
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
  {
    slug: 'vessel-brand-film',
    title: 'Brand film',
    client: 'Vessel',
    category: 'AI Film',
    year: '2025',
    role: 'Direction & edit',
    summary:
      'A 90-second brand film blending generated worlds with a human voiceover — one continuous journey through places that do not exist.',
    sections: [
      {
        heading: 'Problem',
        body: 'The brand story spans five locations no production could afford to visit, let alone light identically for one continuous mood.',
      },
      {
        heading: 'Approach',
        body: 'Built a world bible — palette, atmosphere, lens language — and generated every location inside it. Matched motion between shots so transitions read as one camera that keeps moving.',
      },
      {
        heading: 'Outcome',
        body: 'A festival-selected film and a location library the brand now pulls stills from for every campaign.',
      },
    ],
    media: [
      { kind: 'gradient', ratio: '16/9', label: 'World bible' },
      { kind: 'gradient', ratio: '16/9', label: 'Transition map' },
    ],
  },
  {
    slug: 'meridian-title-sequence',
    title: 'Title sequence',
    client: 'Meridian',
    category: 'Titles',
    year: '2024',
    role: 'Design & direction',
    summary:
      'A main-title sequence grown from generative imagery — every frame synthetic, every cut on the score, delivered broadcast-safe.',
    sections: [
      {
        heading: 'Problem',
        body: 'The series is about systems that drift. A fixed, frame-perfect title sequence would contradict the premise before the first scene.',
      },
      {
        heading: 'Approach',
        body: 'Generated image sequences inside hard aesthetic rails — palette, rhythm and typography locked — then conformed, retimed and graded the picks into ninety seconds that land on the beat.',
      },
      {
        heading: 'Outcome',
        body: 'Titles that feel grown rather than animated, plus a deterministic re-render path for broadcast QC.',
      },
    ],
    media: [
      { kind: 'gradient', ratio: '16/9', label: 'Title card' },
      { kind: 'gradient', ratio: '16/9', label: 'Sequence variants' },
      { kind: 'gradient', ratio: '4/3', label: 'Style rails' },
    ],
  },
  {
    slug: 'northbound-product-launch',
    title: 'Launch films',
    client: 'Northbound',
    category: 'AI Advert',
    year: '2024',
    role: 'AI direction & edit',
    summary:
      'A launch package of twelve short product films — one generative look, four aspect ratios, every platform covered in two weeks.',
    sections: [
      {
        heading: 'Problem',
        body: 'Twelve deliverables across web, retail screens and three social platforms — a matrix that usually eats a production calendar whole.',
      },
      {
        heading: 'Approach',
        body: 'Locked one look and one product turntable language, generated coverage in every ratio natively instead of cropping, and ran the whole matrix through a single edit-and-grade pipeline.',
      },
      {
        heading: 'Outcome',
        body: 'All twelve films delivered in fourteen days, consistent to the frame, with a template the team reruns for every product since.',
      },
    ],
    media: [
      { kind: 'gradient', ratio: '16/9', label: 'Delivery matrix' },
      { kind: 'gradient', ratio: '4/3', label: 'Look frames' },
    ],
  },
];

export const getProject = (slug) => PROJECTS.find((p) => p.slug === slug);
