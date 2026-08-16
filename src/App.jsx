'use client';

import { PlateProvider } from './lib/plate.jsx';
import Stage from './components/Stage.jsx';
import Reveal from './components/Reveal.jsx';
import Works from './components/Works.jsx';
import Chrome from './components/Chrome.jsx';

/**
 * Composition only — every animation decision lives in the modules below.
 *
 * DOM order is load-bearing: these layers are all `position: fixed` and are
 * stacked by paint order as much as by z-index. Reveal A (5) wipes over the
 * Stage (0), the works section (6) sits between the two reveals, Reveal B (7)
 * wipes over the works section, and the Chrome (10) rides on top of all of it.
 *
 * `.runway` is the only element in normal flow. It is 900vh tall and is the
 * sole reason the page scrolls at all — the scroll engine reads `scrollY`
 * against it to produce the normalized `progress` every layer consumes.
 */
export default function App() {
  return (
    <PlateProvider>
      <Stage />
      <Reveal variant="a" />
      <Works />
      <Reveal variant="b" />
      <Chrome />
      <div className="runway" />
    </PlateProvider>
  );
}