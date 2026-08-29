/* KENNEMATIC — LibTV board sync.
 *
 * Pulls media nodes from LibTV canvases into a static manifest the site
 * can render (asset-board grids, case-study media). Run manually or as a
 * `prebuild` step; requires a logged-in `libtv` CLI (`libtv login web`).
 *
 *   node scripts/libtv-sync.mjs
 *
 * Boards are declared in libtv.boards.json at the repo root:
 *   { "advert": "815be83b64c747e5b6f012a4edbd1d50", ... }
 * key = board slug used by the site, value = LibTV canvas UUID.
 *
 * Output: src/lib/libtvManifest.json
 *   { generatedAt, boards: { <slug>: { canvas, groups: [{ id, name }],
 *     assets: [{ id, type, name, group, url, poster }] } } }
 *
 * Bunny mirroring: when BUNNY_STORAGE_ZONE / BUNNY_STORAGE_KEY /
 * BUNNY_CDN_HOST are set (env or .env.local), every asset is copied into
 * the storage zone at <board>/<original filename> — LibTV filenames are
 * content hashes, so existing files are skipped — and the manifest gets
 * your CDN URLs. Without them, LibTV's public CDN URLs pass through.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOARDS_FILE = path.join(ROOT, 'libtv.boards.json');
const OUT_FILE = path.join(ROOT, 'src/lib/libtvManifest.json');
const MEDIA_TYPES = new Set(['image', 'video', 'audio']);
const CONCURRENCY = 4;

// --- env (.env.local, without pulling in a dependency) -----------------------

try {
  const envFile = await readFile(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const BUNNY = process.env.BUNNY_STORAGE_ZONE && process.env.BUNNY_STORAGE_KEY && process.env.BUNNY_CDN_HOST
  ? {
      zone: process.env.BUNNY_STORAGE_ZONE,
      key: process.env.BUNNY_STORAGE_KEY,
      host: process.env.BUNNY_CDN_HOST,
      endpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com',
    }
  : null;

// --- helpers -----------------------------------------------------------------

async function libtv(...args) {
  const { stdout } = await exec('libtv', args, { maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// --- bunny mirror ------------------------------------------------------------

async function bunnyList(dir) {
  const res = await fetch(`https://${BUNNY.endpoint}/${BUNNY.zone}/${dir}/`, {
    headers: { AccessKey: BUNNY.key },
  });
  if (res.status === 404) return new Set();
  if (!res.ok) throw new Error(`bunny list ${dir}: HTTP ${res.status}`);
  return new Set((await res.json()).map((f) => f.ObjectName));
}

async function mirror(board, srcUrl, existing) {
  const file = path.posix.basename(new URL(srcUrl).pathname);
  const dest = `${board}/${file}`;
  if (!existing.has(file)) {
    const src = await fetch(srcUrl);
    if (!src.ok) throw new Error(`fetch ${srcUrl}: HTTP ${src.status}`);
    const body = Buffer.from(await src.arrayBuffer());
    const put = await fetch(`https://${BUNNY.endpoint}/${BUNNY.zone}/${dest}`, {
      method: 'PUT',
      headers: { AccessKey: BUNNY.key, 'Content-Type': 'application/octet-stream' },
      body,
    });
    if (put.status !== 201) throw new Error(`bunny put ${dest}: HTTP ${put.status}`);
    console.log(`    ↑ ${dest} (${(body.length / 1e6).toFixed(1)} MB)`);
  }
  return `https://${BUNNY.host}/${dest}`;
}

// --- sync --------------------------------------------------------------------

async function syncBoard(slug, canvas) {
  const [{ nodes = [] }, { groups = [] }] = await Promise.all([
    libtv('node', 'list', '-p', canvas),
    libtv('group', 'list', '-p', canvas),
  ]);

  // group list may carry childNodeIds; map node -> group name when it does
  const groupOf = new Map();
  for (const g of groups) {
    for (const child of g.childNodeIds ?? []) groupOf.set(child, g.name ?? g.id);
  }

  const existing = BUNNY ? await bunnyList(slug) : null;
  const media = nodes.filter((n) => MEDIA_TYPES.has(n.type));
  const assets = await mapLimit(media, CONCURRENCY, async (n) => {
    const detail = await libtv('node', n.id, '-p', canvas);
    const d = detail.data ?? {};
    let url = Array.isArray(d.url) ? d.url[0] : d.url;
    if (!url) return null; // node exists but nothing generated/uploaded yet
    let poster = d.poster || null;
    if (BUNNY) {
      url = await mirror(slug, url, existing);
      if (poster) poster = await mirror(slug, poster, existing);
    }
    return {
      id: n.id,
      type: n.type,
      name: d.name ?? n.name,
      group: groupOf.get(n.id) ?? null,
      url,
      poster,
    };
  });

  const kept = assets.filter(Boolean);
  console.log(`  ${slug}: ${kept.length}/${media.length} media nodes (${groups.length} groups)`);
  return {
    canvas,
    groups: groups.map((g) => ({ id: g.id, name: g.name ?? g.id })),
    assets: kept,
  };
}

const boardsConfig = JSON.parse(await readFile(BOARDS_FILE, 'utf8'));
console.log(
  `Syncing ${Object.keys(boardsConfig).length} LibTV board(s)` +
    (BUNNY ? ` → mirroring to Bunny zone "${BUNNY.zone}" (${BUNNY.host})` : ' (no Bunny env — passing through LibTV URLs)') +
    '…',
);
const boards = {};
for (const [slug, canvas] of Object.entries(boardsConfig)) {
  boards[slug] = await syncBoard(slug, canvas);
}
await writeFile(
  OUT_FILE,
  JSON.stringify({ generatedAt: new Date().toISOString(), boards }, null, 2) + '\n',
);
console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
