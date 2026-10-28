const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo');
const OUT = path.join(DEMO, 'v2');
const SHOT = (n) => path.join(ROOT, 'screenshots', n);
const PH = (n) => path.join(ROOT, 'fixtures', 'sample_data', 'photos', n);
const LIVE = path.join(DEMO, 'raw_v2', fs.readdirSync(path.join(DEMO, 'raw_v2')).find((f) => f.endsWith('.webm')));
const log = (m) => process.stdout.write(`[v2 ${new Date().toISOString().slice(11, 19)}] ${m}\n`);
const dataUri = (p) => 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64');

const CSS = `*{box-sizing:border-box}html,body{margin:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#1b2430;word-break:keep-all;overflow-wrap:normal}
.k{font:600 26px Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:#5b4bdb}
h1{font-weight:800;letter-spacing:-.02em;margin:14px 0 0;line-height:1.05}
p{margin:22px 0 0;line-height:1.3;color:#2c3645}
.chip{display:inline-block;background:#1b2430;color:#e6e9ff;font:600 28px Consolas,monospace;padding:14px 20px;border-radius:12px;margin-top:28px;line-height:1.35}
.tag{position:absolute;left:44px;bottom:30px;right:44px;font:600 26px 'Segoe UI',sans-serif;color:#6b7587}
.big{font-weight:800;color:#5b4bdb;line-height:1}`;

const panel = ({ k, title, body, big, bigSub, chip, tag }) => `<!doctype html><meta charset=utf-8><style>${CSS}
body{width:630px;height:1080px;background:#f4f6f8;padding:70px 44px 0;position:relative}
h1{font-size:60px}p{font-size:38px}.big{font-size:132px;margin-top:34px}.bs{font-size:34px;color:#2c3645;margin-top:10px;line-height:1.25}</style>
<body><div class=k>${k || 'Is It Working?'}</div><h1>${title}</h1>${body ? `<p>${body}</p>` : ''}
${big ? `<div class=big>${big}</div><div class=bs>${bigSub || ''}</div>` : ''}
${chip ? `<div class=chip>${chip.replace(/\n/g, '<br>')}</div>` : ''}
<div class=tag>${tag || 'Synthetic faces · offline replay of cached YouCam responses'}</div></body>`;

const hookCard = () => `<!doctype html><meta charset=utf-8><style>${CSS}
body{width:1920px;height:1080px;background:#f4f6f8;padding:48px 90px;position:relative}
.top{font-size:84px;font-weight:800;letter-spacing:-.02em}
.row{display:flex;gap:70px;align-items:flex-start;margin-top:26px}
.c{width:520px}.c img{width:520px;height:560px;object-fit:cover;border-radius:18px;display:block;box-shadow:0 8px 30px #0003}
.cap{font-size:34px;margin-top:14px;color:#2c3645}
.sc{font-size:62px;font-weight:800;margin-top:6px}.sc b{color:#5b4bdb}
.mid{flex:1;padding-top:60px}.mid .n{font-size:150px;font-weight:800;color:#d6336c;line-height:1}
.mid p{font-size:46px;margin:12px 0 0}
.syn{position:absolute;left:90px;bottom:34px;font:600 28px Consolas,monospace;color:#6b7587}
</style><body><div class=k>Is It Working?</div><div class=top>“Is this serum actually working?”</div>
<div class=row><div class=c><img src="${dataUri(PH('b8d443fd90c4_d0_0_c8b6dd0b0f.jpg'))}"><div class=cap>Photo 1</div><div class=sc>Pores: <b>38</b></div></div>
<div class=mid><div class=n>+11.7</div><p>Same face.<br>Same minute.<br>Skin AI score moved anyway.</p></div>
<div class=c><img src="${dataUri(PH('b8d443fd90c4_d0_1_9757678def.jpg'))}"><div class=cap>Photo 2, one minute later</div><div class=sc>Pores: <b>50</b></div></div></div>
<div class=syn>SYNTHETIC FACE (AI-generated) · retake = re-crop + exposure shift of the same image</div></body>`;

const apiCard = () => `<!doctype html><meta charset=utf-8><style>${CSS}
body{width:1920px;height:1080px;background:#f4f6f8;padding:60px 90px}
h1{font-size:72px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:26px;margin-top:46px}
.s{background:#fff;border-radius:18px;padding:28px 26px;border:2px solid #dde2ea;min-height:690px}
.s .n{font:700 28px Consolas,monospace;color:#5b4bdb}.s h2{font-size:50px;margin:10px 0 14px;line-height:1.1}
.s p{font-size:36px;margin:0;line-height:1.3}.s code{display:block;margin-top:18px;font:500 26px/1.4 Consolas,monospace;color:#5b4bdb;word-break:break-all}
.ft{margin-top:40px;font-size:42px;color:#2c3645}</style><body><div class=k>Four YouCam APIs, one loop</div><h1>How the YouCam APIs fit together</h1>
<div class=grid>
<div class=s><div class=n>1 · UPLOAD</div><h2>File API</h2><p>Every photo goes up through a signed URL before any analysis.</p><code>POST /s2s/v2.0/file</code></div>
<div class=s><div class=n>2 · MEASURE</div><h2>Skin Analysis</h2><p>15 concerns + skin type per photo. Two same-minute shots give the noise band.</p><code>POST /s2s/v2.0/task/skin-analysis</code></div>
<div class=s><div class=n>3 · PREVIEW</div><h2>Skin Simulation</h2><p>Renders a 50% improvement, then Skin Analysis re-scores it to test if photos can detect it.</p><code>POST /s2s/v2.0/task/skin-simulation</code></div>
<div class=s><div class=n>4 · SAMPLE DATA</div><h2>AI Image Generator</h2><p>Made the synthetic face used in the sample experiments, so no real person appears.</p><code>POST /s2s/v2.0/task/text-to-image/youcam</code></div></div>
<div class=ft>Verdict = change vs. noise band. Real only if it is bigger than the band.</div></body>`;

const endCard = () => `<!doctype html><meta charset=utf-8><style>${CSS}
body{width:1920px;height:1080px;background:#f4f6f8;padding:230px 150px}
h1{font-size:110px}p{font-size:46px;max-width:1500px}.n{font-size:36px;margin-top:50px;color:#2c3645;line-height:1.4}
.big2{margin-top:40px;font-size:50px;font-weight:800;color:#d6336c}</style><body><div class=k>YouCam API Skin AI Hackathon</div>
<h1>Is It Working?</h1><p>A skincare tracker that only calls a change real when it beats your own photo noise — and says “too early” when it can’t tell.</p>
<div class=n>Built with YouCam File API · Skin Analysis · Skin Simulation · AI Image Generator</div>
<div class=big2>Every face in this demo is AI-generated. Not medical advice.</div></body>`;

const scenes = [
  { id: 's1', dur: 5, card: hookCard },
  { id: 's2', dur: 7, still: ['01_home.png', 0, 120], panel: { title: 'Every product is an experiment', body: 'Skin AI scores move with the light. So is that $38 serum working?' } },
  { id: 's3', dur: 11, still: ['03_day0_framing.png', 60, 760], panel: { title: 'Day 0: two selfies, one minute apart', body: 'Your skin did not change in that minute. The gap between the two scores is your personal <b>noise band</b>.', chip: 'YouCam Skin Analysis\n15 concerns · 16 actions' } },
  { id: 's4', dur: 12, still: ['05_product_noise_goal.png', 780, 1400], panel: { title: 'A change only counts if it beats the band', big: '±3.7', bigSub: 'breakouts noise band from this user’s Day 0 pair' } },
  { id: 's5', dur: 9, still: ['05_product_noise_goal.png', 2020, 2700], panel: { title: 'Goal preview, then a detectability check', body: 'Skin Simulation renders a 50% improvement. Skin Analysis re-scores it to see if photos can even show it.', chip: 'YouCam Skin Simulation\n+ Skin Analysis re-score' } },
  { id: 's6', dur: 10, card: apiCard },
  { id: 's7', dur: 18, still: ['07_verdict.png', 60, 560, 1300], panel: { title: 'Breakouts: real. Dark spots: not yet.', big: '+21.3', bigSub: 'breakouts vs. noise ±3.7 → real change<br>Dark spots +3.0 vs ±3.7 → within noise', chip: 'Verdict: Keep going' } },
  { id: 's8', dur: 11, still: ['09_too_early.png', 60, 560, 1150], panel: { title: 'Too early is an answer', big: '+5.4', bigSub: 'pores vs. noise ±9.6 → inside the band. No false hope.', chip: 'Verdict: Too early to tell' } },
  { id: 's9', dur: 11, still: ['10_stop_patch_test.png', 60, 420, 1800], panel: { title: 'Irritation signal: pause and patch‑test', body: 'Constructed scenario built from synthetic images. Not medical advice.', chip: 'Breakouts + redness: real decline\nStop & patch‑test' } },
  { id: 's10', dur: 12, card: endCard }
];

function ff(args) { execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' }); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 630, height: 1080 } });
  const full = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const clips = [];
  for (const s of scenes) {
    const out = path.join(OUT, `${s.id}.mp4`);
    const fade = `fade=t=in:st=0:d=0.4,fade=t=out:st=${s.dur - 0.4}:d=0.4`;
    if (s.card) {
      await full.setContent(s.card(), { waitUntil: 'load' });
      const png = path.join(OUT, `${s.id}.png`);
      await full.screenshot({ path: png });
      ff(['-loop', '1', '-framerate', '30', '-t', String(s.dur), '-i', png, '-vf', `${fade},format=yuv420p`, '-c:v', 'libx264', '-crf', '18', out]);
    } else {
      await pg.setContent(panel(s.panel), { waitUntil: 'load' });
      const ppng = path.join(OUT, `${s.id}_panel.png`);
      await pg.screenshot({ path: ppng });
      let inp, vf;
      if (s.still) {
        const [f, y0, y1, y2] = s.still;
        inp = ['-loop', '1', '-framerate', '30', '-t', String(s.dur), '-i', SHOT(f)];
        const h = s.dur / 2;
        const ye = y2 ? `if(lt(t,${h}),${y0}+(${y1}-${y0})*t/${h},${y1}+(${y2}-${y1})*(t-${h})/${h})` : `${y0}+(${y1}-${y0})*t/${s.dur}`;
        vf = `[0:v]crop=840:700:0:'${ye}',scale=1260:1050:flags=lanczos[a]`;
      } else {
        inp = ['-ss', String(s.live[0]), '-t', String(s.dur), '-i', LIVE];
        vf = `[0:v]fps=30,crop=840:700:0:${s.live[1]},scale=1260:1050:flags=lanczos[a]`;
      }
      ff([...inp, '-loop', '1', '-framerate', '30', '-t', String(s.dur), '-i', ppng, '-f', 'lavfi', '-i', `color=c=0xf4f6f8:s=1920x1080:d=${s.dur}:r=30`,
        '-filter_complex', `${vf};[2:v][a]overlay=30:15[x];[x][1:v]overlay=1290:0,${fade},format=yuv420p[v]`, '-map', '[v]', '-t', String(s.dur), '-c:v', 'libx264', '-crf', '18', out]);
    }
    clips.push(out);
    log(`scene ${s.id} ${s.dur}s done`);
  }
  await b.close();
  const list = path.join(OUT, 'list.txt');
  fs.writeFileSync(list, clips.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'));
  const final = path.join(DEMO, 'is-it-working-demo_v2.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-an', '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', final]);
  log('done ' + final);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
