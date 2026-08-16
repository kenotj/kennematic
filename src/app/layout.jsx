import './globals.css';

export const metadata = {
  title: 'PLATE',
  description: 'PLATE',
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_CLASS }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=BBH+Bartle&family=Alex+Brush&family=Inter+Tight:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
