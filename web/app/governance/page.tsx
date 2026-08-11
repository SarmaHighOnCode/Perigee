import { Button, Eyebrow, Shell, Watermark } from '../components';

const rules = [
  ['01', 'NO MATCH BOOLEAN', 'The API returns ranked candidates, not a machine verdict.'],
  ['02', 'HUMAN DECISION REQUIRED', 'Every search stays pending until an officer records an adjudication.'],
  ['03', 'FORCED COMPARISON', 'At least three candidates are shown, even when the top score is high.'],
  ['04', 'NO PROBE PHOTOS', 'The captured photo is processed locally and never persisted.'],
  ['05', 'MODEL BOUNDARIES', 'Embeddings carry a model identifier; unlike models are never compared.'],
  ['06', 'APPEND-ONLY AUDIT', 'Search and decision events are linked in a tamper-evident hash chain.'],
];

export default function Governance() {
  return <Shell><section className="page-hero ink"><Eyebrow>GOVERNANCE BY DESIGN</Eyebrow><h1>THE SAFETY<br />IS IN THE<br /><mark>SHAPE.</mark></h1><p>Perigee’s limits are encoded in its data model and API contracts, not left as a reminder in the interface.</p></section>
    <section className="section governance-intro"><div><Eyebrow>THE OPERATING PRINCIPLE</Eyebrow><h2>ASSIST THE<br />OFFICER. NEVER<br />REPLACE THEM.</h2></div><p className="large-copy">The fastest way to make a high-stakes system unsafe is to let an uncertain score masquerade as a decision. Perigee is explicitly designed around comparison, judgment, and accountability.</p></section>
    <section className="rules-grid">{rules.map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</section>
    <section className="notice orange"><strong>SYNTHETIC DATA ONLY.</strong><p>No real biometric record is processed by this prototype. Real deployment needs legal authorisation, a DPIA, and independent oversight.</p></section>
    <section className="download-cta"><div><Eyebrow>READ THE RECORD</Eyebrow><h2>THE FULL<br />SECURITY<br />POSTURE.</h2></div><Button href="/docs" tone="ink">OPEN DOCS</Button></section><Watermark />
  </Shell>;
}
