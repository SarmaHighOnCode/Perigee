import Link from 'next/link';
import { Button, Eyebrow, Shell, Watermark } from './components';

function ResultCards() {
  return <div className="result-stack" aria-label="Example candidate and release states">
    <article className="candidate-card">
      <div className="candidate-photo" aria-hidden><span>◉</span></div>
      <div><p className="mono">RANKED CANDIDATE</p><strong>R***** K****</strong><p>3 CASES · BLR STH</p></div>
      <div className="score alert">0.6412<small>STRONG</small></div>
    </article>
    <article className="release-card"><span className="release-mark">✓</span><div><p className="mono">NO CANDIDATES</p><strong>RELEASE</strong><p>HUMAN DECISION RECORDED</p></div></article>
  </div>;
}

export default function Home() {
  return <Shell>
    <section className="hero">
      <div className="hero-copy">
        <Eyebrow>FIELD IDENTITY SCREENING // INDIA</Eyebrow>
        <h1>THE POINT<br />OF <mark>CLOSEST</mark><br />APPROACH.</h1>
        <p className="hero-text">Roadside identity screening that ends in <strong>release</strong>, not detention.</p>
        <div className="hero-actions"><Button href="/download">DOWNLOAD APK</Button><Button href="/how-it-works" tone="ink">HOW IT WORKS</Button></div>
      </div>
      <ResultCards />
      <div className="hero-proof"><span><b>8 SEC</b> SCREENING LOOP</span><span><b>0 PHOTOS</b> STORED</span><span><b>100%</b> HUMAN DECISIONS</span></div>
    </section>

    <section className="section problem" id="problem">
      <div><Eyebrow>THE PROBLEM</Eyebrow><h2>THREE HOURS<br />ON THE ROAD.</h2></div>
      <div className="timeline-grid">
        <article className="timeline old"><p className="mono">TODAY</p><ol><li>Stop &amp; transport</li><li>Register entry</li><li>Manual records query</li><li>Return or release</li></ol><strong>~3 HOURS</strong></article>
        <article className="timeline new"><p className="mono">WITH PERIGEE</p><ol><li>Capture</li><li>Compare on device</li><li>Officer reviews shortlist</li><li>Record a decision</li></ol><strong>~8 SECONDS</strong></article>
      </div>
    </section>

    <section className="section privacy-panel">
      <div className="privacy-phone"><div className="camera-lens"><span>FACE</span></div><div className="phone-bar">ON-DEVICE ONLY</div></div>
      <div><Eyebrow>THE ARCHITECTURAL BET</Eyebrow><h2>THE PHOTO<br />NEVER LEAVES<br />THE PHONE.</h2><p>The phone creates a 512-number representation locally. Only that representation is compared — never the probe photo.</p><Link className="text-link" href="/how-it-works">SEE THE PIPELINE →</Link></div>
    </section>

    <section className="human-panel">
      <Eyebrow>NON-NEGOTIABLE</Eyebrow><h2>THE MACHINE<br />DOES NOT DECIDE.</h2><p>Perigee returns ranked candidates, never a match. An officer compares, decides, and every decision is recorded in an append-only audit chain.</p><Button href="/governance" tone="signal">OUR GOVERNANCE</Button>
    </section>

    <section className="section adoption">
      <div><Eyebrow>BUILT FOR ADOPTION</Eyebrow><h2>DESIGNED TO<br />WITHSTAND QUESTIONS.</h2></div>
      <div className="adoption-grid">
        <article><span>01</span><h3>ON-DEVICE</h3><p>No probe photos on the server. Better privacy and usable on patchy connections.</p></article>
        <article><span>02</span><h3>AUDITABLE</h3><p>Every search and human decision is hash-chained: history cannot be silently rewritten.</p></article>
        <article><span>03</span><h3>SYNTHETIC</h3><p>This prototype contains no real biometric records and makes that visible everywhere.</p></article>
      </div>
    </section>

    <section className="download-cta"><div><Eyebrow>ANDROID FIELD TOOLS</Eyebrow><h2>READY TO<br />SEE IT WORK.</h2></div><Button href="/download" tone="ink">GET THE APPS</Button></section>
    <Watermark />
  </Shell>;
}
