import Link from 'next/link';
import { Button, Eyebrow, Shell, Watermark } from './components';

function ResultCards() {
  return <div className="result-stack" aria-label="Example candidate and release states">
    <article className="candidate-card">
      <div className="candidate-photo" aria-hidden><span>◉</span></div>
      <div><p className="mono">RANKED CANDIDATE</p><strong>R***** K****</strong><p>3 cases · BLR STH</p></div>
      <div className="score alert">0.6412<small>Strong</small></div>
    </article>
    <article className="release-card"><span className="release-mark">✓</span><div><p className="mono">NO CANDIDATES</p><strong>Release</strong><p>Human decision recorded</p></div></article>
  </div>;
}

export default function Home() {
  return <Shell>
    <section className="hero">
      <div className="hero-copy">
        <Eyebrow>Field identity screening · India</Eyebrow>
        <h1>The point of <mark>closest</mark> approach.</h1>
        <p className="hero-text">Roadside identity screening that ends in <strong>release</strong>, not detention. Eight seconds from capture to decision.</p>
        <div className="hero-actions"><Button href="/download" tone="primary">Download APK</Button><Button href="/how-it-works" tone="secondary">How it works</Button></div>
      </div>
      <ResultCards />
      <div className="hero-proof"><span><b>8 sec</b>screening loop</span><span><b>0 photos</b>stored</span><span><b>100%</b>human decisions</span></div>
    </section>

    <section className="section showcase-band-canvas problem" id="problem">
      <div><Eyebrow>The problem</Eyebrow><h2>Three hours on the road.</h2></div>
      <div className="timeline-grid">
        <article className="timeline old"><p className="mono">TODAY</p><ol><li>Stop &amp; transport</li><li>Register entry</li><li>Manual records query</li><li>Return or release</li></ol><strong>~3 hours</strong></article>
        <article className="timeline new"><p className="mono">WITH PERIGEE</p><ol><li>Capture</li><li>Compare on device</li><li>Officer reviews shortlist</li><li>Record a decision</li></ol><strong>~8 seconds</strong></article>
      </div>
    </section>

    <section className="section showcase-band-dark privacy-panel">
      <div className="privacy-phone"><div className="camera-lens"><span>FACE</span></div><div className="phone-bar">On-device only</div></div>
      <div><Eyebrow>The architectural bet</Eyebrow><h2>The photo never leaves the phone.</h2><p>The phone creates a 512-number representation locally. Only that representation is compared — never the probe photo.</p><Link className="text-link" href="/how-it-works">See the pipeline →</Link></div>
    </section>

    <section className="section showcase-band-light human-panel">
      <Eyebrow>Non-negotiable</Eyebrow><h2>The machine does not decide.</h2><p>Perigee returns ranked candidates, never a match. An officer compares, decides, and every decision is recorded in an append-only audit chain.</p><Button href="/governance" tone="secondary">Our governance</Button>
    </section>

    <section className="section showcase-band-canvas adoption">
      <div><Eyebrow>Built for adoption</Eyebrow><h2>Designed to withstand questions.</h2></div>
      <div className="adoption-grid">
        <article><span>01</span><h3>On-device</h3><p>No probe photos on the server. Better privacy and usable on patchy connections.</p></article>
        <article><span>02</span><h3>Auditable</h3><p>Every search and human decision is hash-chained: history cannot be silently rewritten.</p></article>
        <article><span>03</span><h3>Synthetic</h3><p>This prototype contains no real biometric records and makes that visible everywhere.</p></article>
      </div>
    </section>

    <section className="download-cta"><div><Eyebrow>Android field tools</Eyebrow><h2>Ready to see it work.</h2></div><Button href="/download" tone="primary">Get the apps</Button></section>
    <Watermark />
  </Shell>;
}
