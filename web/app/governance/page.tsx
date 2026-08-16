import { Button, Eyebrow, Shell, Watermark } from '../components';

const rules = [
  ['01', 'No match boolean', 'The API returns ranked candidates, not a machine verdict.'],
  ['02', 'Human decision required', 'Every search stays pending until an officer records an adjudication.'],
  ['03', 'Forced comparison', 'At least three candidates are shown, even when the top score is high.'],
  ['04', 'No probe photos', 'The captured photo is processed locally and never persisted.'],
  ['05', 'Model boundaries', 'Embeddings carry a model identifier; unlike models are never compared.'],
  ['06', 'Append-only audit', 'Search and decision events are linked in a tamper-evident hash chain.'],
];

export default function Governance() {
  return <Shell><section className="page-hero ink"><Eyebrow>Governance by design</Eyebrow><h1>The safety is in the <mark>shape.</mark></h1><p>Perigee's limits are encoded in its data model and API contracts, not left as a reminder in the interface.</p></section>
    <section className="section showcase-band-canvas governance-intro"><div><Eyebrow>The operating principle</Eyebrow><h2>Assist the officer. Never replace them.</h2></div><p className="large-copy">The fastest way to make a high-stakes system unsafe is to let an uncertain score masquerade as a decision. Perigee is explicitly designed around comparison, judgment, and accountability.</p></section>
    <section className="rules-grid">{rules.map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</section>
    <section className="notice orange"><strong>Synthetic data only.</strong><p>No real biometric record is processed by this prototype. Real deployment needs legal authorisation, a DPIA, and independent oversight.</p></section>
    <section className="download-cta"><div><Eyebrow>Read the record</Eyebrow><h2>The full security posture.</h2></div><Button href="/docs" tone="primary">Open docs</Button></section><Watermark />
  </Shell>;
}
