import { Button, Eyebrow, Shell, Watermark } from '../components';

const steps = [
  ['01', 'Capture', 'An officer takes a photo only after reasonable grounds establish a lawful purpose.'],
  ['02', 'Embed', 'SCRFD finds the face and ArcFace creates a 512-number embedding on the Android device.'],
  ['03', 'Compare', 'The server searches synthetic record vectors. It receives the embedding — never the photo.'],
  ['04', 'Decide', 'At least three ranked candidates are presented. The officer records a human decision.'],
];

export default function HowItWorks() {
  return <Shell><section className="page-hero cyan"><Eyebrow>How it works</Eyebrow><h1>A shorter road to <mark>clarity.</mark></h1><p>Perigee is a decision-support tool for clearing uncertainty at the roadside — not an automated identification system.</p></section>
    <section className="section showcase-band-canvas pipeline"><div className="pipeline-line" aria-hidden />{steps.map(([number, title, body]) => <article key={number}><span>{number}</span><div><h2>{title}</h2><p>{body}</p></div></article>)}</section>
    <section className="section showcase-band-dark architecture"><div><Eyebrow>One deliberate boundary</Eyebrow><h2>The server never sees a face.</h2></div><div className="architecture-diagram"><div className="arch-node phone-node">Phone<br /><small>capture → embed</small></div><div className="arch-arrow">512 floats →</div><div className="arch-node server-node">Core<br /><small>ranked candidates</small></div><div className="arch-arrow">→</div><div className="arch-node db-node">Records<br /><small>synthetic vectors</small></div></div></section>
    <section className="notice"><strong>The face recognition pipeline is not yet integrated.</strong><p>The backend contract and on-device architecture are ready. Development results use deterministic synthetic fixture vectors and must never be read as recognition results.</p></section>
    <section className="download-cta"><div><Eyebrow>Android prototype</Eyebrow><h2>Try the field tools.</h2></div><Button href="/download" tone="primary">Download APKs</Button></section><Watermark />
  </Shell>;
}
