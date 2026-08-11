import { Eyebrow, Shell, Watermark } from '../components';
import GraphExplorer from './GraphExplorer';

export default function Explore() {
  return <Shell><section className="page-hero magenta"><Eyebrow>CURATED DEMONSTRATION</Eyebrow><h1>EXPLORE THE<br /><mark>ORBIT.</mark></h1><p>One small, hardcoded synthetic community. This is a demonstration — never a public search surface.</p></section><section className="section explore-section"><div className="explore-heading"><div><Eyebrow>RELATIONSHIP VIEW</Eyebrow><h2>EVERY LINK<br />NEEDS EVIDENCE.</h2></div><p>Click nodes to inspect the fictional, masked record. No personal data or arbitrary graph traversal is exposed here.</p></div><GraphExplorer /></section><Watermark /></Shell>;
}
