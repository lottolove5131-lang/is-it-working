const fs = require('fs');
const path = require('path');

const dbFiles = process.argv.slice(2);
if (!dbFiles.length) { console.error('usage: node scripts/calibrate_noise.js <db.json> [...]'); process.exit(1); }
const diffs = {};
let pairs = 0;
for (const f of dbFiles) {
  const db = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const p of db.products) {
    const d0 = p.checkins.find((c) => c.day === 0);
    if (!d0 || d0.shots.length < 2) continue;
    pairs += 1;
    const [a, b] = d0.shots.map((s) => s.scores);
    for (const c of Object.keys(a)) if (typeof b[c] === 'number') (diffs[c] = diffs[c] || []).push(a[c] - b[c]);
  }
}
const FLOOR = 1.5;
const sigma = {};
for (const [c, d] of Object.entries(diffs)) {
  const s = Math.sqrt(d.reduce((acc, v) => acc + v * v, 0) / d.length / 2);
  sigma[c] = Math.round(Math.max(FLOOR, s) * 100) / 100;
}
const out = { note: 'Per-concern prior photo noise (SD of one YouCam Skin Analysis raw score), from same-day Day 0 retake pairs.', pairs, floor: FLOOR, sigma, generatedAt: new Date().toISOString() };
fs.writeFileSync(path.join(__dirname, '..', 'lib', 'noise_prior.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
