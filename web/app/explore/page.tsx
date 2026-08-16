import { Eyebrow, Shell, Watermark } from '../components';
import GraphExplorer from './GraphExplorer';

export default function Explore() {
  return <Shell><section className="page-hero magenta"><Eyebrow>Curated demonstration</Eyebrow><h1>Explore the <mark>orbit.</mark></h1><p>One small, hardcoded synthetic community. This is a demonstration — never a public search surface.</p></section><section className="section explore-section"><div className="explore-heading"><div><Eyebrow>Relationship view</Eyebrow><h2>Every link needs evidence.</h2></div><p>Click nodes to inspect the fictional, masked record. No personal data or arbitrary graph traversal is exposed here.</p></div><GraphExplorer /></section><Watermark /></Shell>;
}
