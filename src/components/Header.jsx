'use client';

/* PLATE® — header nav.
 *
 * The three <a> elements MUST stay direct children of the <nav>: src/index.css
 * keys the staggered entrance off `.header__item:nth-child(n)`.
 *
 * Every interactive rule is expressed as a *class* (never an inline style) so
 * the cascade resolves exactly as it did in legacy/style.css — the entrance
 * rule `.js.is-ready .header__item` (0,3,0) has to keep winning over
 * `:hover` / `:active` (0,2,0), and an inline style would break that.
 */

const ITEMS = [
  { id: 'menu', href: '#menu', label: 'Menu', align: '' },
  { id: 'about', href: '#about', label: 'About', align: 'text-center' },
  { id: 'contact', href: '#contact', label: 'Contact', align: 'text-right' },
];

/* transition + :active are arbitrary *properties* on purpose — they must land
   on `transform` (not v4's standalone `scale` property) to match legacy. */
const ITEM_CLASS = [
  'header__item',
  'flex-1 min-w-0',
  'font-display uppercase text-ui whitespace-nowrap',
  'pointer-events-auto',
  '[transition:opacity_200ms_linear,transform_120ms_linear]',
  '[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-[.65]',
  'active:[transform:scale(.97)]',
  'focus-visible:[outline:2px_solid_var(--red)]',
  'focus-visible:[outline-offset:4px]',
  'focus-visible:[box-shadow:0_0_0_6px_rgba(0,0,0,.9)]',
].join(' ');

export default function Header() {
  return (
    <nav
      className="header absolute flex justify-between items-start"
      style={{
        top: 'calc(var(--top-header) + env(safe-area-inset-top))',
        left: 'var(--pad-header)',
        right: 'var(--pad-header)',
      }}
    >
      {ITEMS.map((item) => (
        <a
          key={item.id}
          id={item.id}
          href={item.href}
          className={item.align ? `${ITEM_CLASS} ${item.align}` : ITEM_CLASS}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}