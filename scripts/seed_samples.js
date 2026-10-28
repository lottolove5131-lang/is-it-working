const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:3000';
const IMG = path.join(__dirname, '..', 'fixtures', 'demo_images');
const log = (m) => process.stdout.write(`[seed ${new Date().toISOString().slice(11, 19)}] ${m}\n`);

const SAMPLES = [
  {
    name: 'Daily Niacinamide 10% Serum', ingredient: 'niacinamide', targets: ['pore', 'age_spot', 'oiliness'],
    checkins: [{ day: 0, files: ['maya_day0_a.jpg', 'maya_day0_b.jpg'] }, { day: 7, files: ['maya_day7.jpg'] }]
  },
  {
    name: 'Night Retinol 0.3% Cream', ingredient: 'retinol', targets: ['wrinkle', 'texture', 'acne'],
    checkins: [{ day: 0, files: ['jun_day0_a.jpg', 'jun_day0_b.jpg'] }, { day: 14, files: ['jun_day14.jpg'] }]
  }
];

async function call(p, opts) {
  const r = await fetch(BASE + p, opts);
  const j = await r.json();
  if (!r.ok) throw new Error(`${p}: ${j.error}`);
  return j;
}

(async () => {
  for (const s of SAMPLES) {
    log(`create ${s.name}`);
    const prod = await call('/api/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: s.name, ingredient: s.ingredient, targets: s.targets })
    });
    for (const c of s.checkins) {
      log(`  day ${c.day}: ${c.files.join(', ')}`);
      const fd = new FormData();
      fd.append('day', String(c.day));
      for (const f of c.files) fd.append('photos', new Blob([fs.readFileSync(path.join(IMG, f))], { type: 'image/jpeg' }), f);
      const res = await call(`/api/products/${prod.id}/checkins`, { method: 'POST', body: fd });
      const h = res.evaluation.history;
      if (h && h.length) log(`  verdict day ${h[h.length - 1].day}: ${h[h.length - 1].verdict.title}`);
    }
  }
  log('done');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
