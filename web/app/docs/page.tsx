import { Eyebrow, Shell, Watermark } from '../components';

const documents = [
  ['00-EXECUTIVE-SUMMARY.md', '00', 'Executive summary', 'The pitch in one page.'], ['01-ARCHITECTURE.md', '01', 'System architecture', 'Components, boundaries, data flow, and latency.'], ['04-FACE-PIPELINE.md', '04', 'Face recognition pipeline', 'Model plan, alignment, thresholds, and governance.'], ['05-MOBILE-APPS.md', '05', 'Mobile applications', 'Field and Enroll app scope.'], ['06-WEB-FRONTEND.md', '06', 'Web frontend', 'The marketing site and graph demo specification.'], ['07-DESIGN-SYSTEM.md', '07', 'Design system', 'Shared neobrutalist tokens and motion grammar.'], ['08-SECURITY.md', '08', 'Security & governance', 'Threat model and defensible constraints.'], ['09-COMPLIANCE-INDIA.md', '09', 'India compliance annex', 'The legal and oversight path.'], ['11-GRAPH-INTELLIGENCE.md', '11', 'Graph intelligence', 'The relationship graph model.'], ['13-BUILD-PLAN.md', '13', 'Build plan', 'Implementation order and cut-lines.'],
];

export default function Docs() {
  return <Shell><section className="page-hero cyan"><Eyebrow>Technical record</Eyebrow><h1>Build in the <mark>open.</mark></h1><p>The technical documentation is maintained in the repository so architecture, code, and claims stay connected.</p></section><section className="section docs-list"><p className="mono">PERIGEE / DOCUMENTATION</p>{documents.map(([file, number, title, description]) => <a key={file} href={`https://github.com/SarmaHighOnCode/Perigee/blob/main/docs/${file}`} target="_blank" rel="noreferrer"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div><b>↗</b></a>)}</section><Watermark /></Shell>;
}
