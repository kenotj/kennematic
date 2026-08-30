import { Montserrat } from 'next/font/google';

import './globals.css';
import { LiquidDefs } from '../components/site/liquidHover.jsx';
import RouteWatcher from '../components/site/RouteWatcher.jsx';
import { ProjectsProvider } from '../lib/projectsContext.jsx';
import { getAllProjects, getFeaturedProjects } from '../lib/db.js';

/* Project content lives in Postgres; hourly ISR keeps every route static
 * between edits. Editing the table + waiting out (or on-demand busting) this
 * window is the whole publish flow. */
export const revalidate = 3600;

/* Variable font: omitting `weight` loads the full 100–900 axis in both styles.
 * The family name next/font generates is hashed — components must reach it
 * through the --font-montserrat variable, never a literal 'Montserrat'. */
const montserrat = Montserrat({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-montserrat',
  display: 'swap',
});

const SITE_TITLE = 'KENNEMATIC';
const SITE_DESCRIPTION =
  'KENNEMATIC — Kenneth Ong, AI director. Films and advert content made with generative video.';
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'KENNEMATIC' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/og.png'],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/* The entrance styles key off `html.js`. This MUST stay an inline script rather
 * than a server-rendered className: with JS disabled the class must be absent,
 * otherwise the mark, tag and header items stay at opacity 0 forever. It also
 * has to run before first paint, or the page flashes its rested state first. */

const JS_CLASS = "document.documentElement.classList.add('js')";

/* Because that script runs before hydration, the client <html> carries a class
 * the server HTML does not. suppressHydrationWarning on <html> silences the
 * expected mismatch; it applies only to that element's own attributes and text,
 * not to its subtree. */

export default async function RootLayout({ children }) {
  const [projects, featured] = await Promise.all([getAllProjects(), getFeaturedProjects()]);
  return (
    <html lang="en" className={montserrat.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_CLASS }} />
      </head>
      <body>
        {/* The goo filters every LiquidFill references. Defined once at the
            root so the ids resolve on every route. */}
        <LiquidDefs />
        {/* Renders nothing; closes the view transition each route commit. */}
        <RouteWatcher />
        <ProjectsProvider projects={projects} featured={featured}>
          {children}
        </ProjectsProvider>
      </body>
    </html>
  );
}
