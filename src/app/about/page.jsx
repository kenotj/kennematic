/* KENNEMATIC — about. All copy is placeholder; swap for the real bio. */

import SiteHeader from '../../components/site/SiteHeader.jsx';
import { CONTACT_EMAIL } from '../../lib/constants.js';

export const metadata = {
  title: 'About · KENNEMATIC',
  description: 'Kenneth Ong — AI director. Films and advert content made with generative video.',
};

const SKILLS = [
  'AI film direction',
  'Advert content',
  'Edit & grade',
  'Sound design',
  'Motion & VFX',
  'Design & prototyping',
];

const TOOLS = [
  'Premiere Pro',
  'DaVinci Resolve',
  'CapCut',
  'After Effects',
  'Audition',
  'Blender',
  'Figma',
];

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main
        className="mx-auto w-full max-w-[min(92vw,1200px)]"
        style={{ padding: 'calc(var(--pad-header) * 2 + 56px) 0 calc(var(--pad-header) * 4)' }}
      >
        <h1 className="font-display font-extrabold uppercase text-stat leading-[100%]">About</h1>

        <div className="mt-[max(32px,4vw)] flex max-w-[65ch] flex-col gap-[1em] text-[length:var(--fs-ui)] leading-[150%]">
          <p>
            I&apos;m Kenneth Ong, an AI director working under the name{' '}
            <strong>KENNEMATIC</strong>. I direct films and advert content made with generative
            video — casting worlds instead of crews, and cutting them like the real thing.
          </p>
          <p>
            <em>Kennematics</em> is kinetics times cinematics: the belief that how something moves
            says as much as what it shows. The generation is the easy part — taste, timing and the
            edit are where a film actually gets made.
          </p>
          <p>
            This site itself is part of the portfolio — the landing page is one continuous
            scroll-scrubbed take, built frame by frame.
          </p>
        </div>

        <section className="mt-[max(48px,6vw)] grid gap-[max(32px,4vw)] md:grid-cols-2">
          <div>
            <h2 className="m-0 text-[length:var(--fs-micro)] uppercase tracking-[0.12em] opacity-70">
              What I do
            </h2>
            <ul className="m-0 mt-[12px] list-none p-0 text-[length:var(--fs-ui)] leading-[180%]">
              {SKILLS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="m-0 text-[length:var(--fs-micro)] uppercase tracking-[0.12em] opacity-70">
              Tools
            </h2>
            <ul className="m-0 mt-[12px] list-none p-0 text-[length:var(--fs-ui)] leading-[180%]">
              {TOOLS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </section>

        <p className="mt-[max(48px,6vw)] text-[length:var(--fs-ui)]">
          Say hello —{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:opacity-[.65]">
            {CONTACT_EMAIL}
          </a>
        </p>
      </main>
    </>
  );
}
