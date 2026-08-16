import { Button, Eyebrow, Shell, Watermark } from '../components';

const releasesUrl = 'https://github.com/SarmaHighOnCode/Perigee/releases/latest';

export default function Download() {
  return <Shell><section className="page-hero yellow"><Eyebrow>Android distribution</Eyebrow><h1>The field tools, <mark>ready.</mark></h1><p>Two focused Android apps: one for roadside screening, one for enrollment. Release packages will appear here when published.</p></section>
    <section className="section showcase-band-canvas downloads"><article className="app-release field-release"><div><p className="mono">PERIGEE // FIELD</p><h2>Roadsides move fast.</h2><p>Capture, review ranked candidates, and record a human decision.</p></div><div><p className="mono">v0.1.0 · UNRELEASED</p><Button href={releasesUrl} tone="secondary" external>View releases</Button></div></article><article className="app-release enroll-release"><div><p className="mono">PERIGEE // ENROLL</p><h2>Records start clean.</h2><p>Register synthetic records, add evidence, and link documented relationships.</p></div><div><p className="mono">v0.1.0 · UNRELEASED</p><Button href={releasesUrl} tone="secondary" external>View releases</Button></div></article></section>
    <section className="download-notes showcase-band-dark"><h2>Before you install.</h2><ul><li><strong>ANDROID ONLY.</strong> Android 8.0+ is required. iOS distribution is not in scope.</li><li><strong>FACE PIPELINE PENDING.</strong> The on-device recognition model is not yet integrated; the prototype uses synthetic fixtures.</li><li><strong>SYNTHETIC DATA ONLY.</strong> This is a demonstrator, not an operational law-enforcement deployment.</li></ul></section><Watermark />
  </Shell>;
}
