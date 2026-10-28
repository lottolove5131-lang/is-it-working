require('dotenv').config();
const fs = require('fs');
const yc = require('../lib/youcam');
(async () => {
  const r = await yc.skinAnalysis(fs.readFileSync(process.argv[2]));
  console.log('cached', r.cached, 'units', r.units);
  for (const o of r.raw.data.results.output) console.log(o.type, o.region || '', o.raw_score ?? o.score ?? '', o.ui_score ?? '', o.skin_type || '');
  console.log('masks', Object.keys(r.masks).length, 'spent total', yc.unitsSpent());
})().catch(e => { console.error('FAIL', e.message, JSON.stringify(e.body || {}).slice(0, 500)); process.exit(1); });
