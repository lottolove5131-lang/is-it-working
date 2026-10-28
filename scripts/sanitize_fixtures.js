const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'fixtures', 'cache');
let n = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const p = path.join(dir, f);
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(/(https:\/\/[^"?\s]+)\?[^"\s]*/g, '$1?[signature-removed]');
  if (after !== before) { fs.writeFileSync(p, after); n += 1; }
}
console.log(`sanitized signed URLs in ${n} cached responses`);
