import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Perigee — Roadside identity screening',
  description: 'A field identity-screening system that helps officers clear people quickly, with a human decision at every step.',
  metadataBase: new URL('https://perigee-web.vercel.app'),
  openGraph: {
    title: 'Perigee — The point of closest approach.',
    description: 'Roadside identity screening that ends in release, not detention.',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
