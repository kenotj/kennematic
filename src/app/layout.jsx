import { Montserrat } from 'next/font/google';

import './globals.css';
import { LiquidDefs } from '../components/site/liquidHover.jsx';
import RouteWatcher from '../components/site/RouteWatcher.jsx';

/* Variable font: omitting `weight` loads the full 100–900 axis in both styles.
 * The family name next/font generates is hashed — components must reach it
 * through the --font-montserrat variable, never a literal 'Montserrat'. */
const montserrat = Montserrat({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata = {
  title: 'KENNEMATIC',
  description: 'KENNEMATIC — Kenneth Ong, AI director. Films and advert content made with generative video.',
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

export default function RootLayout({ children }) {
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
        {children}
      </body>
    </html>
  );
}
