require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const yc = require('../lib/youcam');

const IMG = path.join(__dirname, '..', 'fixtures', 'demo_images');
const p = (n) => path.join(IMG, n);

async function retake(src, dest, { brightness = 1, dx = 0, dy = 0, zoom = 1, rotate = 0 }) {
  const meta = await sharp(src).metadata();
  const W = meta.width, H = meta.height;
  if (zoom < 1) {
    const sw = Math.round(W * zoom), sh = Math.round(H * zoom);
    const padL = Math.round((W - sw) / 2 + dx * W), padT = Math.round((H - sh) / 2 + dy * H);
    await sharp(src).resize(sw, sh)
      .extend({ left: padL, right: W - sw - padL, top: padT, bottom: H - sh - padT, background: '#e9ecee' })
      .modulate({ brightness }).jpeg({ quality: 92 }).toFile(dest);
    return;
  }
  const cw = Math.round(W / zoom), ch = Math.round(H / zoom);
  const left = Math.max(0, Math.min(W - cw, Math.round((W - cw) / 2 + dx * W)));
  const top = Math.max(0, Math.min(H - ch, Math.round((H - ch) / 2 + dy * H)));
  let img = sharp(src);
  if (rotate) img = sharp(await img.rotate(rotate, { background: '#e9ecee' }).toBuffer());
  const rm = rotate ? await img.metadata() : meta;
  const l2 = Math.round(left + (rm.width - W) / 2), t2 = Math.round(top + (rm.height - H) / 2);
  await img
    .extract({ left: Math.max(0, l2), top: Math.max(0, t2), width: cw, height: ch })
    .resize(W, H)
    .modulate({ brightness })
    .jpeg({ quality: 92 })
    .toFile(dest);
}

async function step(label, fn) {
  process.stdout.write(`\n== ${label}\n`);
  return fn();
}

(async () => {
  const A = p('maya_day0_a.jpg');

  await step('Make same-day retake and Day 7 retake (local transforms, no units)', async () => {
    await retake(A, p('maya_day0_b.jpg'), { brightness: 1.05, dx: 0.008, dy: -0.006, zoom: 1.02, rotate: 1 });
    await retake(A, p('maya_day7.jpg'), { brightness: 0.97, dx: -0.006, dy: 0.005, zoom: 1.015, rotate: -0.8 });
    await retake(A, p('maya_bad_dark.jpg'), { brightness: 0.55, dx: 0.02, zoom: 0.92 });
  });

  const simGoal = await step('Skin Simulation: niacinamide goal / Day 14 source (pores, spots)', () =>
    yc.skinSimulation(fs.readFileSync(A), { pores: 0.6, spots: 0.5 }));
  await retake(path.join(yc.CACHE_DIR, simGoal.image), p('maya_day14.jpg'), { brightness: 1.02, dx: -0.004, dy: 0.004, zoom: 1.01, rotate: 0.6 });

  const simClear = await step('Skin Simulation: clear baseline for retinol scenario (acne, redness)', () =>
    yc.skinSimulation(fs.readFileSync(A), { acne: 0.85, redness: 0.7 }));
  fs.copyFileSync(path.join(yc.CACHE_DIR, simClear.image), p('jun_day0_a.jpg'));
  await retake(p('jun_day0_a.jpg'), p('jun_day0_b.jpg'), { brightness: 0.96, dx: -0.007, dy: 0.006, zoom: 1.02, rotate: -1 });
  await retake(A, p('jun_day14.jpg'), { brightness: 1.03, dx: 0.005, dy: -0.004, zoom: 1.012, rotate: 0.7 });

  const files = ['maya_day0_a.jpg', 'maya_day0_b.jpg', 'maya_day7.jpg', 'maya_day14.jpg', 'jun_day0_a.jpg', 'jun_day0_b.jpg', 'jun_day14.jpg'];
  const summary = {};
  let i = 0;
  for (const f of files) {
    i += 1;
    const r = await step(`Skin Analysis ${i}/${files.length}: ${f}`, () => yc.skinAnalysis(fs.readFileSync(p(f))));
    const scores = {};
    for (const o of r.raw.data.results.output) if (typeof o.raw_score === 'number') scores[o.type] = Math.round(o.raw_score * 10) / 10;
    summary[f] = { cached: r.cached, scores };
    console.log(f, r.cached ? '(cache)' : '(live)', JSON.stringify(scores));
  }
  fs.writeFileSync(path.join(__dirname, '..', 'fixtures', 'demo_summary.json'), JSON.stringify(summary, null, 2));
  console.log('\nTotal units spent (ledger):', yc.unitsSpent());
})().catch((e) => { console.error('FAIL', e.message, JSON.stringify(e.body || {}).slice(0, 500)); process.exit(1); });
