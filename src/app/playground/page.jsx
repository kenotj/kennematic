/* KENNEMATIC — playground: loose experiments, reels, one-offs that aren't
 * full case studies. All cards are placeholders. */

import SiteHeader from '../../components/site/SiteHeader.jsx';
import MediaPlaceholder from '../../components/site/MediaPlaceholder.jsx';

export const metadata = {
  title: 'Playground · KENNEMATIC',
  description: 'Experiments, reels, and one-off motion studies.',
};

const EXPERIMENTS = [
  { label: 'One-prompt shorts', note: 'A film a day, single prompt each', ratio: '16/9' },
  { label: 'Impossible camera moves', note: 'Generated dolly paths no rig could fly', ratio: '16/9' },
  { label: 'Synthetic film stocks', note: 'Grain and halation recipes in Resolve', ratio: '4/3' },
  { label: 'AI foley sketches', note: 'Generated sound beds, cut in Audition', ratio: '1/1' },
  { label: 'Fake commercials', note: 'Spec spots for brands that do not exist', ratio: '16/9' },
  { label: 'Character continuity tests', note: 'Same face, forty shots', ratio: '1/1' },
  { label: 'Blender plate mashups', note: '3D layouts driving generated frames', ratio: '4/3' },
  { label: 'CapCut speedruns', note: 'Brief to posted in one hour', ratio: '16/9' },
];

export default function PlaygroundPage() {
  return (
    <>
      <SiteHeader trail={[{ label: 'Playground' }]} />
      <main
        className="mx-auto w-[calc(100%-2rem)] max-w-[1200px] pt-[calc(var(--spacing-page)*2+56px)] pb-[calc(var(--spacing-page)*4+env(safe-area-inset-bottom))] sm:w-[92vw]"
      >
        <h1 className="font-display text-sub-stat leading-[100%] font-extrabold uppercase">
          Playground
        </h1>
        <p className="mt-4 max-w-[60ch] text-sub-ui leading-[150%] opacity-80">
          Experiments and studies that never asked to be case studies. Updated whenever something
          escapes the drafts folder.
        </p>
        <div className="mt-[max(32px,4vw)] grid gap-[max(16px,1.6327vw)] sm:grid-cols-2 lg:grid-cols-3">
          {EXPERIMENTS.map((e) => (
            <div key={e.label} className="flex flex-col gap-[8px]">
              <MediaPlaceholder label={e.label} ratio={e.ratio} />
              <p className="m-0 text-sub-micro leading-relaxed opacity-70">{e.note}</p>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
