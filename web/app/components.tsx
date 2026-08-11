import Link from 'next/link';
import type { ReactNode } from 'react';

export function Logo() {
  return <Link className="wordmark" href="/" aria-label="Perigee home"><span aria-hidden>▓▓</span> PERIGEE</Link>;
}

export function Header() {
  return <header className="site-header"><Logo /><nav aria-label="Main navigation"><Link href="/how-it-works">HOW IT WORKS</Link><Link href="/governance">GOVERNANCE</Link><Link href="/explore">EXPLORE</Link><Link href="/docs">DOCS</Link><Link className="nav-download" href="/download">↓ APK</Link></nav></header>;
}

export function Footer() {
  return <footer className="site-footer"><Logo /><p>PERIGEE IS A SYNTHETIC-DATA PROTOTYPE. NOT AN OPERATIONAL SYSTEM.</p><a href="https://github.com/SarmaHighOnCode/Perigee" target="_blank" rel="noreferrer">GITHUB ↗</a></footer>;
}

export function Shell({ children }: { children: ReactNode }) {
  return <><Header /><main>{children}</main><Footer /></>;
}

export function Button({ href, children, tone = 'signal', external = false }: { href: string; children: ReactNode; tone?: 'signal' | 'ink' | 'clear' | 'data'; external?: boolean }) {
  const props = external ? { target: '_blank', rel: 'noreferrer' } : {};
  return <Link className={`button button-${tone}`} href={href} {...props}>{children}<span aria-hidden>↗</span></Link>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow"><span aria-hidden>■</span> {children}</p>;
}

export function Watermark() {
  return <div className="watermark" aria-hidden>SYNTHETIC DATA · SYNTHETIC DATA · SYNTHETIC DATA · SYNTHETIC DATA ·</div>;
}
