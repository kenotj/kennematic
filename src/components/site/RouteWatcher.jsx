'use client';

/* KENNEMATIC — resolves the pending view transition when the route commits.
 *
 * Lives in the root layout so it outlives every page: the link that starts a
 * transition unmounts as part of it and can never report its own arrival.
 * Renders nothing. See lib/routeTransition.js.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { finishRouteTransition } from '../../lib/routeTransition.js';

export default function RouteWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    finishRouteTransition();
  }, [pathname]);

  return null;
}
