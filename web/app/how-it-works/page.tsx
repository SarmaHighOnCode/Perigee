import { Button, Eyebrow, Shell, Watermark } from '../components';

const steps = [
  ['01', 'CAPTURE', 'An officer takes a photo only after reasonable grounds establish a lawful purpose.'],
  ['02', 'EMBED', 'SCRFD finds the face and ArcFace creates a 512-number embedding on the Android device.'],
  ['03', 'COMPARE', 'The server searches synthetic record vectors. It receives the embedding — never the photo.'],
  ['04', 'DECIDE', 'At least three ranked candidates are presented. The officer records a human decision.'],
];

export default function HowItWorks() {
  return <Shell><section className="page-hero cyan"><Eyebrow>HOW IT WORKS</Eyebrow><h1>A SHORTER<br />ROAD TO <mark>CLARITY.</mark></h1><p>Perigee is a decision-support tool for clearing uncertainty at the roadside — not an automated identification system.</p></section>
    <section className="section pipeline"><div className="pipeline-line" aria-hidden />{steps.map(([number, title, body]) => <article key={number}><span>{number}</span><div><h2>{title}</h2><p>{body}</p></div></article>)}</section>
    <section className="section architecture"><div><Eyebrow>ONE DELIBERATE BOUNDARY</Eyebrow><h2>THE SERVER<br />NEVER SEES<br />A FACE.</h2></div><div className="architecture-diagram"><div className="arch-node phone-node">PHONE<br /><small>capture → embed</small></div><div className="arch-arrow">512 FLOATS →</div><div className="arch-node server-node">CORE<br /><small>ranked candidates</small></div><div className="arch-arrow">→</div><div className="arch-node db-node">RECORDS<br /><small>synthetic vectors</small></div></div></section>
    <section className="notice"><strong>THE FACE RECOGNITION PIPELINE IS NOT YET INTEGRATED.</strong><p>The backend contract and on-device architecture are ready. Development results use deterministic synthetic fixture vectors and must never be read as recognition results.</p></section>
    <section className="download-cta"><div><Eyebrow>ANDROID PROTOTYPE</Eyebrow><h2>TRY THE<br />FIELD TOOLS.</h2></div><Button href="/download" tone="ink">DOWNLOAD APKS</Button></section><Watermark />
  </Shell>;
}
