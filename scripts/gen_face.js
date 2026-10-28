require('dotenv').config();
const fs = require('fs'); const path = require('path');
const yc = require('../lib/youcam');
(async () => {
  const prompt = process.argv[2];
  const out = process.argv[3];
  const r = await yc.textToImage(prompt, { negative: 'makeup, glasses, hair covering forehead, smiling with teeth, tilted head, side view, harsh shadows, blurry, cartoon, painting, text, watermark, airbrushed skin' });
  console.log(JSON.stringify(r.raw).slice(0, 400));
  if (r.image) { fs.copyFileSync(path.join(yc.CACHE_DIR, r.image), out); console.log('saved', out); }
})().catch(e => { console.error('FAIL', e.message, JSON.stringify(e.body || {}).slice(0, 400)); process.exit(1); });
