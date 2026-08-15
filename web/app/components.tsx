import Link from 'next/link';
import type { ReactNode } from 'react';

export function Logo() {
  return <Link className="wordmark" href="/" aria-label="Perigee home">PERIGEE</Link>;
}

export function Header() {
  return <header className="site-header"><Logo /><nav aria-label="Main navigation"><Link href="/how-it-works">How it works</Link><Link href="/governance">Governance</Link><Link href="/explore">Explore</Link><Link href="/docs">Docs</Link><Link className="nav-download" href="/download">Download</Link></nav></header>;
}

export function Footer() {
  return <footer className="site-footer"><Logo /><p>Perigee is a synthetic-data prototype. Not an operational system.</p><a href="https://github.com/SarmaHighOnCode/Perigee" target="_blank" rel="noreferrer">GitHub ↗</a></footer>;
}

export function Shell({ children }: { children: ReactNode }) {
  return <><Header /><main>{children}</main><Footer /></>;
}

export function Button({ href, children, tone = 'primary', external = false }: { href: string; children: ReactNode; tone?: 'primary' | 'secondary'; external?: boolean }) {
  const props = external ? { target: '_blank', rel: 'noreferrer' } : {};
  return <Link className={`button button-${tone}`} href={href} {...props}>{children}</Link>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow"><span aria-hidden>—</span> {children}</p>;
}

export function Watermark() {
  return <div className="watermark" aria-hidden>SYNTHETIC DATA · SYNTHETIC DATA · SYNTHETIC DATA · SYNTHETIC DATA ·</div>;
}
