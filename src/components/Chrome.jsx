'use client';

/* PLATE® — fixed chrome layer.
 *
 * The `perspective` here is load-bearing: `.exit-3d` blocks translate on +Z and
 * the perspective origin (default 50% 50% of this fixed, inset-0 box = viewport
 * centre) is what makes those blocks both scale up AND push down out of frame.
 * Removing it flattens the whole exit choreography.
 */

import Header from './Header.jsx';
import Title from './Title.jsx';
import About from './About.jsx';
import Stats from './Stats.jsx';

export default function Chrome() {
  return (
    <div
      className="chrome fixed inset-0 z-10 pointer-events-none"
      style={{ perspective: '1200px' }}
    >
      <Header />
      <Title />
      <About />
      <Stats />
    </div>
  );
}