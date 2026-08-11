'use client';

import { useState } from 'react';

const nodes = [
  { id: 'P-0001', x: 50, y: 50, size: 22, color: '#FFE600', cases: 6, edges: 5 },
  { id: 'P-0024', x: 27, y: 28, size: 14, color: '#00C2CB', cases: 3, edges: 3 },
  { id: 'P-0076', x: 74, y: 30, size: 15, color: '#FF3EA5', cases: 4, edges: 4 },
  { id: 'P-0112', x: 24, y: 70, size: 13, color: '#00C853', cases: 1, edges: 2 },
  { id: 'P-0130', x: 75, y: 72, size: 14, color: '#FF6B00', cases: 2, edges: 3 },
  { id: 'P-0219', x: 8, y: 48, size: 10, color: '#00C2CB', cases: 1, edges: 1 },
  { id: 'P-0304', x: 91, y: 50, size: 11, color: '#FF3EA5', cases: 2, edges: 1 },
];
const lines = [[50, 50, 27, 28], [50, 50, 74, 30], [50, 50, 24, 70], [50, 50, 75, 72], [27, 28, 8, 48], [74, 30, 91, 50]];

export default function GraphExplorer() {
  const [selected, setSelected] = useState(nodes[0]);
  return <div className="graph-wrap"><div className="graph-canvas" role="group" aria-label="Synthetic relationship graph">{lines.map((line, i) => <svg className="graph-line" key={i} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} /></svg>)}{nodes.map((node) => <button className={`graph-node ${selected.id === node.id ? 'selected' : ''}`} key={node.id} style={{ left: `${node.x}%`, top: `${node.y}%`, width: node.size, height: node.size, background: node.color }} onClick={() => setSelected(node)} aria-label={`Select ${node.id}`} />)}</div><aside className="graph-panel"><p className="mono">SELECTED NODE</p><h2>{selected.id}</h2><dl><div><dt>CASES</dt><dd>{selected.cases}</dd></div><div><dt>EVIDENCED EDGES</dt><dd>{selected.edges}</dd></div><div><dt>DATASET</dt><dd>SYNTHETIC</dd></div></dl><p>Node labels are masked by design. Edges in this demonstration represent documented co-occurrence only.</p></aside></div>;
}
