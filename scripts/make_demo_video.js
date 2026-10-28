const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo');
const RAW = path.join(DEMO, 'raw');
const CARDS = path.join(DEMO, 'cards');
const log = (m) => process.stdout.write(`[demo ${new Date().toISOString().slice(11, 19)}] ${m}\n`);

const CAPTIONS = {
  home: ['The moment', 'Standing at the mirror: <b>is this product actually doing anything?</b> Photos alone can\'t answer that — light, angle and distance change every day.', ''],
  register: ['Track a product', 'Pick the active ingredient. We pre-select the concerns it targets and its typical time to results.', ''],
  day0: ['Day 0 — two selfies', 'An oval guide keeps framing consistent. On-device checks score exposure, light colour and sharpness before any API call.', 'Optional: YouCam JS Camera Kit (skincare mode) for guided capture'],
  analyze0: ['YouCam Skin Analysis', 'Each photo is uploaded through the File API and scored on 15 concerns + skin type.', 'POST /s2s/v2.0/file → PUT signed URL\nPOST /s2s/v2.0/task/skin-analysis\nGET  /s2s/v2.0/task/skin-analysis/{id}\nformat=json · 16 SD actions'],
  noise: ['Your photo noise', 'Same face, same day — different scores. That spread, pooled with a per-concern prior, becomes the <b>noise band</b> every future change must clear.', 'Pores and texture jump the most on a head turn'],
  goal: ['Goal preview', 'YouCam Skin Simulation renders a realistic 50% improvement on the user\'s own face — then we score that image to check the change is even detectable by photo.', 'POST /s2s/v2.0/task/skin-simulation\n{ acne: 0.5, redness: 0.5, spots: 0.5 }\n→ re-scored with Skin Analysis'],
  day14: ['Day 14 check-in', 'A faint Day 0 overlay lines the face up. Lighting and colour are compared against Day 0.', ''],
  analyze14: ['Day 14 check-in', 'One photo, one Skin Analysis call. Results are cached by image hash, so nothing is billed twice.', ''],
  verdict: ['The verdict', 'A change counts only when it clears the noise band. Breakouts <b>+21.3</b> (band ±3.7) and redness improved → <b>Keep going</b>.', 'Next step is always one concrete action'],
  masks: ['Where it changed', 'YouCam detection masks for Day 0 vs Day 14, per concern.', 'mask_urls from the Skin Analysis response'],
  list: ['Every product is an experiment', 'Two more sample experiments show the other honest answers.', ''],
  early: ['"Too early" is an answer', 'Niacinamide, Day 7: pores moved +5.4, but this user\'s band is ±9.6. No false hope — check again on Day 14.', ''],
  stop: ['Side-effect watch', 'Retinol, Day 14: breakouts and redness got measurably worse than photo noise can explain → <b>Stop & patch-test</b>.', '']
};

function cardHtml(title, body, code, kind) {
  const full = kind === 'full';
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
html,body{margin:0;background:${full ? '#f4f6f8' : 'transparent'};}
body{width:${full ? 1920 : 900}px;height:1080px;display:flex;flex-direction:column;justify-content:center;padding:0 ${full ? 200 : 40}px;box-sizing:border-box;color:#1b2430;font-family:'Atkinson Hyperlegible',sans-serif;word-break:keep-all}
.k{font:500 22px 'IBM Plex Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#5b4bdb}
h1{font:800 ${full ? 96 : 64}px/1.02 'Bricolage Grotesque',sans-serif;letter-spacing:-.02em;margin:18px 0 0}
p{font-size:${full ? 38 : 34}px;line-height:1.4;margin:26px 0 0;color:#2c3645;max-width:${full ? 1300 : 820}px}
b{color:#1b2430}
pre{font:400 24px/1.55 'IBM Plex Mono',monospace;background:#1b2430;color:#e6e9ff;padding:22px 26px;border-radius:14px;margin:34px 0 0;white-space:pre-wrap;max-width:780px}
.note{font:400 24px 'IBM Plex Mono',monospace;color:#7b8597;margin-top:30px}
.g{display:flex;align-items:center;gap:0;margin-top:44px;width:${full ? 900 : 700}px;position:relative;height:40px}
.g .t{position:absolute;left:0;right:0;top:18px;height:5px;border-radius:3px;background:#dde2ea}
.g .b{position:absolute;left:30%;width:28%;top:6px;height:28px;border-radius:14px;background:repeating-linear-gradient(135deg,#dfe4ec 0 7px,#e9edf3 7px 14px);border:1px solid #c3cad6}
.g .n{position:absolute;left:80%;top:0;bottom:0;width:6px;border-radius:3px;background:#5b4bdb}
</style></head><body>
<div class="k">${kind === 'full' ? 'YouCam API Skin AI Hackathon' : 'Is It Working?'}</div>
<h1>${title}</h1><p>${body}</p>
${code && code.includes('/') ? `<pre>${code.replace(/</g, '&lt;')}</pre>` : code ? `<div class="note">${code}</div>` : ''}
${full ? '<div class="g"><div class="t"></div><div class="b"></div><div class="n"></div></div>' : ''}
</body></html>`;
}

async function renderCards() {
  fs.mkdirSync(CARDS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1080 } });
  for (const [k, [title, body, code]] of Object.entries(CAPTIONS)) {
    await page.setContent(cardHtml(title, body, code, 'side'), { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(CARDS, `${k}.png`), omitBackground: true });
    log(`card ${k}`);
  }
  const full = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await full.setContent(cardHtml('Is It Working?', 'A skincare efficacy tracker that knows how much your photos lie — and only calls a change real when it clears <b>your</b> noise band.', '', 'full'), { waitUntil: 'networkidle' });
  await full.screenshot({ path: path.join(CARDS, 'intro.png') });
  await full.setContent(cardHtml('Built on YouCam', 'Skin Analysis (16 actions, File API, polling) · Skin Simulation (goal preview + detectability) · AI Image Generator · JS Camera Kit.<br><br><span style="font-size:28px;color:#7b8597">All faces in this demo are synthetic, AI-generated images. Not medical advice.</span>', '', 'full'), { waitUntil: 'networkidle' });
  await full.screenshot({ path: path.join(CARDS, 'outro.png') });
  await browser.close();
}

function record() {
  fs.rmSync(RAW, { recursive: true, force: true });
  fs.mkdirSync(RAW, { recursive: true });
  log('recording the full flow with Playwright (about 90 s)');
  const r = spawnSync(process.execPath, ['tests/e2e.js'], {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, RECORD_DIR: RAW, SEED_FROM: 'fixtures/sample_data', E2E_PORT: '3127' }
  });
  if (r.status !== 0) throw new Error('recording run failed');
  const webm = fs.readdirSync(RAW).find((f) => f.endsWith('.webm'));
  return { webm: path.join(RAW, webm), events: JSON.parse(fs.readFileSync(path.join(RAW, 'events.json'), 'utf8')) };
}

function ffmpeg(args) {
  log(`ffmpeg ${args.slice(-1)[0]}`);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

(async () => {
  await renderCards();
  const { webm, events } = record();
  const end = events.find((e) => e.label === 'end').t + 1.5;
  const segs = events.filter((e) => CAPTIONS[e.label]);
  const inputs = ['-f', 'lavfi', '-i', `color=c=0xf4f6f8:s=1920x1080:d=${end}:r=30`, '-i', webm];
  segs.forEach((s) => inputs.push('-loop', '1', '-t', String(end), '-i', path.join(CARDS, `${s.label}.png`)));
  let f = `[1:v]scale=-2:1000,setpts=PTS-STARTPTS[ph];[0:v][ph]overlay=200:40:shortest=1[v0]`;
  segs.forEach((s, i) => {
    const next = segs[i + 1] ? segs[i + 1].t : end;
    f += `;[v${i}][${i + 2}:v]overlay=880:0:enable='between(t,${s.t.toFixed(2)},${next.toFixed(2)})'[v${i + 1}]`;
  });
  const main = path.join(DEMO, '_main.mp4');
  ffmpeg([...inputs, '-filter_complex', f, '-map', `[v${segs.length}]`, '-t', String(end), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', main]);
  const intro = path.join(DEMO, '_intro.mp4');
  const outro = path.join(DEMO, '_outro.mp4');
  ffmpeg(['-loop', '1', '-t', '5', '-i', path.join(CARDS, 'intro.png'), '-vf', 'fade=in:0:15,fade=out:st=4.5:d=0.5', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', intro]);
  ffmpeg(['-loop', '1', '-t', '7', '-i', path.join(CARDS, 'outro.png'), '-vf', 'fade=in:0:15', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outro]);
  const list = path.join(DEMO, '_list.txt');
  fs.writeFileSync(list, [intro, main, outro].map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  const final = path.join(DEMO, 'is-it-working-demo.mp4');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
  for (const t of [intro, main, outro, list]) fs.rmSync(t, { force: true });
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).toString().trim();
  log(`done: ${final} (${Number(dur).toFixed(1)} s)`);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
